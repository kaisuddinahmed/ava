import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '0.0.0.0', // Bind to all network interfaces
        port: 4000,
        strictPort: true,
        allowedHosts: true // Allow any host header (fixes some proxy/tunnel issues)
    }
});
