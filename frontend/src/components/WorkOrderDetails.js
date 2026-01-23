// src/components/WorkOrderDetails.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { TreeView, TreeItem } from '@mui/x-tree-view';
import api from '../api';
import PDFEditor from './PDFEditor';

// PDF.js worker is set globally in App.js

const WorkOrderDetails = ({ jobId: propJobId, token: propToken, userRole, onJobUpdate }) => {
  // Support both route params and props for flexibility
  const { id: routeJobId } = useParams();
  const jobId = propJobId || routeJobId;
  const token = propToken || localStorage.getItem('token');
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [folders, setFolders] = useState([]);
  const [bidAmount, setBidAmount] = useState('');
  const [preFieldNotes, setPreFieldNotes] = useState('');
  const [jobStatus, setJobStatus] = useState('active');

  useEffect(() => {
    const fetchJobDetails = async () => {
      try {
        // api module automatically adds Authorization header
        const response = await api.get(`/api/jobs/${jobId}`);
        setFolders(response.data.folders);
        setJobStatus(response.data.status);
        // TODO: Fetch existing bid/notes if any
      } catch (err) {
        console.error('Failed to fetch WO details:', err);
      }
    };
    fetchJobDetails();
  }, [jobId]);

  // Separate cleanup effect for blob URL to avoid refetching job data on every doc open
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const handleDocClick = async (folderName, doc) => {
    try {
      // Get fresh token on each call to avoid stale/null token issues
      const currentToken = localStorage.getItem('token');
      if (!currentToken) {
        alert('Please log in to view documents.');
        return;
      }
      const response = await fetch(doc.url, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!response.ok) throw new Error('Failed to load document');
      const blob = await response.blob();
      setPdfBlobUrl(URL.createObjectURL(blob));
      setSelectedDoc({ ...doc, folderName });
    } catch (error) {
      alert('Could not load the document.');
    }
  };

  const handleBidSubmit = async () => {
    try {
      // Use the /status endpoint with status='pre-field' and bid info
      await api.put(`/api/jobs/${jobId}/status`, { 
        status: 'pre-field',
        bidAmount: parseFloat(bidAmount),
        bidNotes: preFieldNotes 
      });
      onJobUpdate(); // Refresh parent
    } catch (err) {
      console.error('Bid submission failed:', err);
    }
  };

  const handlePhotoUpload = async (e) => {
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => formData.append('photos', file));
    try {
      // api module automatically adds Authorization header
      await api.post(`/api/jobs/${jobId}/photos`, formData);
      onJobUpdate();
    } catch (err) {
      console.error('Photo upload failed:', err);
    }
  };

  const handleSubmitJob = async () => {
    try {
      // Use the /status endpoint to mark job as completed
      await api.put(`/api/jobs/${jobId}/status`, { status: 'completed' });
      onJobUpdate();
    } catch (err) {
      console.error('Job submission failed:', err);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30%', borderRight: '1px solid #ddd', padding: '16px' }}>
        <h2>Folders</h2>
        <TreeView>
          {folders.map(folder => (
            <TreeItem nodeId={`folder-${folder.name}`} label={folder.name} key={`folder-${folder.name}`}>
              {folder.documents.map((doc, docIndex) => (
                <TreeItem
                  nodeId={`${folder.name}-doc-${docIndex}-${doc.name}`}
                  label={doc.name}
                  key={`${folder.name}-doc-${docIndex}-${doc.name}`}
                  onClick={() => handleDocClick(folder.name, doc)}
                />
              ))}
            </TreeItem>
          ))}
        </TreeView>
      </div>
      <div style={{ flex: 1, padding: '16px' }}>
        <h2>Work Order Details</h2>
        {pdfBlobUrl ? (
          <>
            <Document file={pdfBlobUrl} onLoadSuccess={onDocumentLoadSuccess}>
              <Page pageNumber={pageNumber} renderAnnotationLayer={true} renderTextLayer={true} />
            </Document>
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <p>Page {pageNumber} of {numPages}</p>
              <button onClick={() => setPageNumber((prev) => Math.max(prev - 1, 1))} disabled={pageNumber <= 1}>Previous</button>
              <button onClick={() => setPageNumber((prev) => Math.min(prev + 1, numPages)) } disabled={pageNumber >= numPages}>Next</button>
            </div>
            {userRole === 'contributor' && selectedDoc && (
              <PDFEditor doc={selectedDoc} jobId={jobId} folderName={selectedDoc.folderName} token={token} />
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '100px', color: '#666' }}>
            <h2>Select a document to view/edit</h2>
          </div>
        )}

        {/* General Foreman: Bid/Pre-Field */}
        {userRole === 'foreman' && jobStatus === 'active' && (
          <div style={{ marginTop: '20px' }}>
            <h3>Pre-Field and Bid the Job</h3>
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder="Bid Amount ($)"
              style={{ marginRight: '10px' }}
            />
            <textarea
              value={preFieldNotes}
              onChange={(e) => setPreFieldNotes(e.target.value)}
              placeholder="Pre-Field Notes (site conditions, etc.)"
              style={{ width: '80%', height: '100px' }}
            />
            <button onClick={handleBidSubmit}>Submit Bid</button>
          </div>
        )}

        {/* Foreman: Photo Upload + Submit */}
        {userRole === 'contributor' && jobStatus === 'in progress' && (
          <div style={{ marginTop: '20px' }}>
            <h3>Upload Construction Photos</h3>
            <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} />
            <button onClick={handleSubmitJob} style={{ marginTop: '10px' }}>Submit Completed Job</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkOrderDetails;