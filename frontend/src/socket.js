import { io } from 'socket.io-client';

// Socket authenticated with the stored login token (anonymous for TV / public board)
export function createSocket() {
  let token;
  try {
    token = JSON.parse(localStorage.getItem('user'))?.token;
  } catch (e) { /* no stored user */ }
  return io('/', { auth: token ? { token } : {} });
}
