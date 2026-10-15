import { Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';
import Home from '@/pages/Home';
import ProductDetail from '@/pages/ProductDetail';
import { ForgotPassword, Login, ResetPassword, Signup } from '@/pages/auth';
import Account, { OrderDetail } from '@/pages/Account';
import Checkout from '@/pages/Checkout';
import { PaymentFailed, PaymentSuccess } from '@/pages/Payment';
import Admin from '@/pages/Admin';
import Info, { INFO_PATHS } from '@/pages/Info';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="products/:slug" element={<ProductDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="account/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="payment/success" element={<RequireAuth><PaymentSuccess /></RequireAuth>} />
        <Route path="payment/failed" element={<PaymentFailed />} />
        <Route path="admin" element={<RequireAuth><Admin /></RequireAuth>} />
        {INFO_PATHS.map((p) => <Route key={p} path={p} element={<Info />} />)}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
