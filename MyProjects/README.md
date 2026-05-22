# Fluid Shader Engine

An interactive fluid simulation rendered with WebGL shaders and React. This project implements Navier-Stokes fluid dynamics with advanced rendering techniques including specular lighting, environment reflection, and fresnel effects.

## Features

- **Real-time Fluid Simulation** - Navier-Stokes equations solved on GPU
- **Advanced Rendering** - Specular highlights, environment mapping, fresnel effects
- **Theme Support** - Light/dark mode with smooth transitions
- **Performance Optimized** - WebGL-based computation
- **React Integration** - Modern React components with TypeScript

## Project Structure

```
├── fluidShaderEngine.ts    # Main shader definitions and WebGL logic
├── GlobalStyles.css        # Global styling and theme variables
├── themeMode.ts           # Theme switching utilities
├── useCallbackRef.ts      # Custom React hook for callback refs
├── useDebounce.ts         # Debounce utility hook
├── useScrollReveal.ts     # Scroll reveal animation hook
├── server.ts              # Express HTTPS server
└── package.json           # Dependencies
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The application will run on `http://localhost:3000`

## HTTPS Setup

To enable HTTPS for production deployment:

1. **Obtain SSL Certificates**
   - Self-signed (development): Use OpenSSL or similar
   - Production: Use Let's Encrypt, AWS Certificate Manager, or other CA

2. **Set Environment Variables**
   ```bash
   export CERT_PATH="/path/to/certificate.crt"
   export KEY_PATH="/path/to/private-key.key"
   export NODE_ENV="production"
   ```

3. **Run the Server**
   ```bash
   npm start
   ```

### Generate Self-Signed Certificate (Development Only)

```bash
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
```

Then set:
```bash
export CERT_PATH="./cert.pem"
export KEY_PATH="./key.pem"
```

## Deployment

### Option 1: Vercel
```bash
vercel
```

### Option 2: Heroku
```bash
heroku create
git push heroku main
```

### Option 3: AWS/DigitalOcean/Linode
- Deploy to any Node.js hosting platform
- Set SSL certificates through platform settings
- Configure environment variables in platform dashboard

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires WebGL 2.0 support for shader compilation.

## Technical Details

### Shader Pipeline

1. **Splat** - Add dye/velocity to simulation
2. **Advection** - Transport velocity field
3. **Divergence** - Calculate field divergence
4. **Pressure** - Solve pressure using Jacobi iteration
5. **Gradient Subtract** - Apply pressure gradient
6. **Display** - Render final result with lighting

### Performance

- GPU-accelerated fluid simulation
- Optimized texture lookups
- Efficient memory management
- Real-time 60 FPS target

## License

MIT

## Author

Created for interactive shader exploration and GPU computing demonstrations.
