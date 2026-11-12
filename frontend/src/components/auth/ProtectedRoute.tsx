import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import InitializationScreen from '../layout/InitializationScreen';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <InitializationScreen statusMessage="Restoring secure session…" />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}
