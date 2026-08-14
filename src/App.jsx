import React from 'react';
import '@questlabs/react-sdk/dist/style.css';
import GroundGameSupportDashboard from './components/GroundGameSupportDashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <GroundGameSupportDashboard />
    </ErrorBoundary>
  );
}

export default App;