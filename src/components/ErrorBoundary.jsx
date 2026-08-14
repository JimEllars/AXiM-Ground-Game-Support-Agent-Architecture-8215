import React from 'react';
import SafeIcon from '../common/SafeIcon';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-900 border border-red-900/50 rounded-xl m-4 text-center">
          <SafeIcon name="AlertTriangle" className="text-red-500 text-4xl mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Component Crashed</h2>
          <p className="text-gray-400 text-sm mb-4">The UI component failed to load due to an unexpected error.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
