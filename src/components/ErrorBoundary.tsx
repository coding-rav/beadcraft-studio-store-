import { Component, ReactNode } from 'react';

/** Catches render errors so customers see a friendly page, never a stack trace or internal detail. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('UI error:', error.message); }   // message only; no secrets are ever in UI state
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl text-[#7A1F2B]">Something went wrong</h1>
        <p className="mt-3">Please refresh the page. If it keeps happening, contact the store.</p>
        <button onClick={() => location.assign('/')} className="mt-6 min-h-[44px] rounded-full bg-[#7A1F2B] px-6 text-[#FFFAF6]">Back to the shop</button>
      </main>);
  }
}
