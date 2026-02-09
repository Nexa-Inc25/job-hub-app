/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Notification Tests
 * Tests for notification model and service
 * 
 * Uses shared test setup from __tests__/setup.js
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const notificationService = require('../services/notification.service');

describe('Notification Model', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockCompanyId = new mongoose.Types.ObjectId();
  const mockJobId = new mongoose.Types.ObjectId();

  test('should create a notification with required fields', async () => {
    const notification = await Notification.create({
      userId: mockUserId,
      companyId: mockCompanyId,
      type: 'unit_approved',
      title: 'Unit Approved',
      message: 'Your unit has been approved'
    });

    expect(notification._id).toBeDefined();
    expect(notification.userId.toString()).toBe(mockUserId.toString());
    expect(notification.type).toBe('unit_approved');
    expect(notification.read).toBe(false);
    expect(notification.createdAt).toBeDefined();
    expect(notification.expiresAt).toBeDefined();
  });

  test('should store additional data in data field', async () => {
    const notification = await Notification.create({
      userId: mockUserId,
      type: 'unit_rejected',
      title: 'Unit Rejected',
      message: 'Your unit was rejected',
      data: {
        jobId: mockJobId,
        woNumber: 'WO-12345',
        rejectionReason: 'Missing photos'
      }
    });

    expect(notification.data.jobId.toString()).toBe(mockJobId.toString());
    expect(notification.data.woNumber).toBe('WO-12345');
    expect(notification.data.rejectionReason).toBe('Missing photos');
  });

  test('should validate notification type enum', async () => {
    await expect(
      Notification.create({
        userId: mockUserId,
        type: 'invalid_type',
        title: 'Test',
        message: 'Test'
      })
    ).rejects.toThrow();
  });

  test('should mark notification as read', async () => {
    const notification = await Notification.create({
      userId: mockUserId,
      type: 'job_assigned',
      title: 'Job Assigned',
      message: 'You have been assigned a job'
    });

    expect(notification.read).toBe(false);

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    const updated = await Notification.findById(notification._id);
    expect(updated.read).toBe(true);
    expect(updated.readAt).toBeDefined();
  });

  test('should create notifications with different types', async () => {
    const types = [
      'unit_approved',
      'unit_rejected',
      'unit_submitted',
      'claim_created',
      'job_assigned',
      'job_status_changed',
      'document_uploaded',
      'system'
    ];

    for (const type of types) {
      const notification = await Notification.create({
        userId: mockUserId,
        type,
        title: `Test ${type}`,
        message: `Test message for ${type}`
      });
      expect(notification.type).toBe(type);
    }

    const count = await Notification.countDocuments({ userId: mockUserId });
    expect(count).toBe(types.length);
  });

  test('should query unread notifications efficiently', async () => {
    // Create mix of read and unread
    await Notification.create([
      { userId: mockUserId, type: 'system', title: 'Read', message: 'Test', read: true },
      { userId: mockUserId, type: 'system', title: 'Unread 1', message: 'Test', read: false },
      { userId: mockUserId, type: 'system', title: 'Unread 2', message: 'Test', read: false }
    ]);

    const unreadCount = await Notification.countDocuments({ userId: mockUserId, read: false });
    expect(unreadCount).toBe(2);
  });
});

describe('Notification Service', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockCompanyId = new mongoose.Types.ObjectId();

  // Initialize service without socket.io for testing
  beforeAll(() => {
    // Service is already initialized without io in test context
  });

  test('getNotifications returns paginated results', async () => {
    // Create 25 notifications
    const notifications = [];
    for (let i = 0; i < 25; i++) {
      notifications.push({
        userId: mockUserId,
        type: 'system',
        title: `Notification ${i}`,
        message: `Message ${i}`,
        createdAt: new Date(Date.now() - i * 1000) // Stagger creation times
      });
    }
    await Notification.insertMany(notifications);

    // Get first page
    const page1 = await notificationService.getNotifications(mockUserId, { limit: 10 });
    expect(page1).toHaveLength(10);
    expect(page1[0].title).toBe('Notification 0'); // Most recent first

    // Get second page
    const page2 = await notificationService.getNotifications(mockUserId, { limit: 10, skip: 10 });
    expect(page2).toHaveLength(10);
    expect(page2[0].title).toBe('Notification 10');
  });

  test('getUnreadCount returns correct count', async () => {
    await Notification.create([
      { userId: mockUserId, type: 'system', title: '1', message: 'Test', read: false },
      { userId: mockUserId, type: 'system', title: '2', message: 'Test', read: false },
      { userId: mockUserId, type: 'system', title: '3', message: 'Test', read: true }
    ]);

    const count = await notificationService.getUnreadCount(mockUserId);
    expect(count).toBe(2);
  });

  test('markAsRead updates notification', async () => {
    const notification = await Notification.create({
      userId: mockUserId,
      type: 'job_assigned',
      title: 'Test',
      message: 'Test'
    });

    expect(notification.read).toBe(false);

    const updated = await notificationService.markAsRead(notification._id, mockUserId);
    expect(updated.read).toBe(true);
    expect(updated.readAt).toBeDefined();
  });

  test('markAsRead returns null for wrong user', async () => {
    const notification = await Notification.create({
      userId: mockUserId,
      type: 'job_assigned',
      title: 'Test',
      message: 'Test'
    });

    const wrongUserId = new mongoose.Types.ObjectId();
    const result = await notificationService.markAsRead(notification._id, wrongUserId);
    expect(result).toBeNull();
  });

  test('markAllAsRead updates all unread notifications', async () => {
    await Notification.create([
      { userId: mockUserId, type: 'system', title: '1', message: 'Test', read: false },
      { userId: mockUserId, type: 'system', title: '2', message: 'Test', read: false },
      { userId: mockUserId, type: 'system', title: '3', message: 'Test', read: true }
    ]);

    const result = await notificationService.markAllAsRead(mockUserId);
    expect(result.modifiedCount).toBe(2);

    const unreadCount = await notificationService.getUnreadCount(mockUserId);
    expect(unreadCount).toBe(0);
  });

  test('notifyUser creates notification in database', async () => {
    const notification = await notificationService.notifyUser({
      userId: mockUserId,
      companyId: mockCompanyId,
      type: 'unit_approved',
      title: 'Unit Approved',
      message: 'Your unit XYZ was approved',
      data: { woNumber: 'WO-123' }
    });

    expect(notification._id).toBeDefined();
    expect(notification.type).toBe('unit_approved');
    expect(notification.data.woNumber).toBe('WO-123');

    // Verify it's in database
    const found = await Notification.findById(notification._id);
    expect(found).not.toBeNull();
  });
});

