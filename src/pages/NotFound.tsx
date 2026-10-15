import { Link } from 'react-router-dom';
export default function NotFound() {
  return <div className="p-14 text-center"><h1 className="text-3xl text-[#7A1F2B]">Page not found</h1><p className="mt-2">That page doesn’t exist.</p><Link to="/" className="mt-4 inline-block underline">Back to the shop</Link></div>;
}
