import React, { useState, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // State for data and UI
  const [schemaFile, setSchemaFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [transcribedText, setTranscribedText] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState([]);
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const [queryExecuted, setQueryExecuted] = useState(false);

  // Refs for audio recording
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  // --- Handlers ---

  const handleFileChange = (event) => {
    setSchemaFile(event.target.files[0]);
  };

  const handleSchemaUpload = async () => {
    if (!schemaFile) {
      setError('Please select a schema file first.');
      return;
    }
    const formData = new FormData();
    formData.append('file', schemaFile);
    setError('');

    try {
      const response = await axios.post('http://localhost:8000/api/schema', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert(response.data.message);
    } catch (error) {
      console.error('Error uploading schema:', error);
      setError('Error uploading schema. Check the console for details.');
    }
  };

  const processQueryResponse = (response) => {
    setTranscribedText(response.data.query || '');
    setSqlQuery(response.data.sql_query || '');
    setQueryResult(response.data.result || []);
    setMessage(response.data.message || '');
    setQueryExecuted(true);
  };

  const handleError = (err, defaultMessage) => {
    console.error(defaultMessage, err);
    const errorDetail = err.response?.data?.detail || 'An unknown error occurred.';
    setError(`Error: ${errorDetail}`);
    setQueryResult([]);
    setMessage('');
    setQueryExecuted(true); // Mark as executed to show the error
  };

  const resetStateForNewQuery = () => {
    setError('');
    setQueryExecuted(false);
    setMessage('');
    setTranscribedText('');
    setSqlQuery('');
    setQueryResult([]);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      setError('Please enter a query.');
      return;
    }
    resetStateForNewQuery();
    try {
      const response = await axios.post('http://localhost:8000/api/text-query', { query: textInput });
      processQueryResponse(response);
    } catch (err) {
      handleError(err, 'Error processing text query:');
    }
  };

  const handleStartRecording = () => {
    resetStateForNewQuery();
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        mediaRecorder.current = new MediaRecorder(stream);
        mediaRecorder.current.ondataavailable = (event) => {
          audioChunks.current.push(event.data);
        };
        mediaRecorder.current.onstop = async () => {
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio_file', audioBlob, 'recording.webm');
          try {
            const response = await axios.post('http://localhost:8000/api/speech-query', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            processQueryResponse(response);
          } catch (err) {
            handleError(err, 'Error processing speech query:');
          }
          audioChunks.current = [];
        };
        mediaRecorder.current.start();
        setIsRecording(true);
      })
      .catch(err => {
        handleError(err, 'Error accessing microphone:');
        setError('Could not access microphone. Please ensure permissions are granted.');
      });
  };

  const handleStopRecording = () => {
    mediaRecorder.current.stop();
    setIsRecording(false);
  };

  // --- Render Logic ---

  const renderResult = () => {
    if (error) {
      return <p style={{ color: 'red' }}>{error}</p>;
    }
    if (!queryExecuted) {
      return <p>Submit a query to see results here.</p>;
    }
    return (
      <>
        {message && <p><strong>{message}</strong></p>}
        {queryResult.length > 0 && (
          <table>
            <thead>
              <tr>
                {Object.keys(queryResult[0]).map(key => <th key={key}>{key}</th>)}
              </tr>
            </thead>
            <tbody>
              {queryResult.map((row, index) => (
                <tr key={index}>
                  {Object.values(row).map((value, i) => <td key={i}>{String(value)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Speech and Text to Database with Gemini</h1>
      </header>
      <main>
        <section>
          <h2>1. Upload Database Schema</h2>
          <input type="file" onChange={handleFileChange} />
          <button onClick={handleSchemaUpload}>Upload Schema</button>
        </section>
        
        <section>
          <h2>2. Submit Your Query</h2>
          <p>You can either type a query or record one with your voice.</p>
          
          <div>
            <textarea 
              rows="3"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="e.g., Show all users"
            />
            <br />
            <button onClick={handleTextSubmit}>Submit Text</button>
          </div>

          <div style={{ margin: '20px 0', textAlign: 'center' }}>
            <strong>OR</strong>
          </div>

          <div>
            <button onClick={isRecording ? handleStopRecording : handleStartRecording}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>
        </section>

        {queryExecuted && (
          <section>
            <h2>Results</h2>
            <p><strong>Your Query:</strong> {transcribedText || "N/A"}</p>
            <p><strong>Gemini-Generated SQL:</strong> <code>{sqlQuery || "N/A"}</code></p>
            <div>
              <h3>Database Output:</h3>
              {renderResult()}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;