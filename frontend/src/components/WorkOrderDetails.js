// src/components/WorkOrderDetails.js
import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { TreeView, TreeItem } from '@mui/x-tree-view';
import axios from 'axios';
import PDFEditor from './PDFEditor';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// ... rest of the file remains the same

const WorkOrderDetails = ({ jobId, token, userRole, onJobUpdate }) => {
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
        const response = await axios.get(`/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFolders(response.data.folders);
        setJobStatus(response.data.status);
        // TODO: Fetch existing bid/notes if any
      } catch (err) {
        console.error('Failed to fetch WO details:', err);
      }
    };
    fetchJobDetails();

    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [jobId, token, pdfBlobUrl]); // Added pdfBlobUrl to deps

  const handleDocClick = async (folderName, doc) => {
    try {
      const response = await fetch(doc.url, {
        headers: { Authorization: `Bearer ${token}` },
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
      await axios.post(`/api/jobs/${jobId}/bid`, { bidAmount, preFieldNotes }, {
        headers: { Authorization: `Bearer ${token}` },
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
      await axios.post(`/api/jobs/${jobId}/photos`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      onJobUpdate();
    } catch (err) {
      console.error('Photo upload failed:', err);
    }
  };

  const handleSubmitJob = async () => {
    try {
      await axios.post(`/api/jobs/${jobId}/complete`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
            <TreeItem itemId={folder.name} label={folder.name} key={folder.name}>
              {folder.documents.map(doc => (
                <TreeItem
                  itemId={doc.url}
                  label={doc.name}
                  key={doc.url}
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