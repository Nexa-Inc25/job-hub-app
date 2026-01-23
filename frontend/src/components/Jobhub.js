// src/components/JobHub.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { pdfjs } from 'react-pdf'; // Import pdfjs

// Use non-ESM build for CRA compatibility
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const JobHub = () => {
  const { id } = useParams();
  const [job, setJob] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    api.get(`/api/jobs/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => setJob(res.data))
      .catch(err => console.error(err));
  }, [id]);

  if (!job) return <div>Loading...</div>;

  return (
    <div>
      <h1>{job.title}</h1>
      {/* Example PDF viewer if needed */}
      {/* <Document file="example.pdf"><Page pageNumber={1} /></Document> */}
    </div>
  );
};

export default JobHub;