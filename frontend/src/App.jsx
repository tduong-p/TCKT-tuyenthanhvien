import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Board from './pages/Board';
import CandidateView from './pages/CandidateView';
import InterviewerView from './pages/InterviewerView';
import AdminView from './pages/AdminView';
import ReceptionistView from './pages/ReceptionistView';
import TvView from './pages/TvView';
import Footer from './components/Footer';

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <Router>
      {/* The TV page is locked to the screen height (with the footer), the other pages grow */}
      <div className="flex flex-col min-h-screen has-[.tv-page]:h-screen">
        <div className="flex-1 flex flex-col min-h-0">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/board" element={<Board />} />
            <Route path="/tv" element={<TvView />} />
            <Route path="/candidate" element={<CandidateView />} />
            <Route path="/interviewer" element={<InterviewerView />} />
            <Route path="/admin" element={<AdminView />} />
            <Route path="/receptionist" element={<ReceptionistView />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
