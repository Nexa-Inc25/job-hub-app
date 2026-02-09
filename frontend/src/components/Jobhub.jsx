/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/FieldLedger.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

const FieldLedger = () => {
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

export default FieldLedger;