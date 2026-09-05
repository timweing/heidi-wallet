// Lokaler Dev-Server: dieselbe Express-App wie die Vercel-Function, mit listen().
//   cp .env.example .env  (Backend-Teil ausfuellen)  &&  npm run server
//   -> Endpunkte unter http://localhost:8788/api/heidi/...  und  http://localhost:8788/...
import 'dotenv/config'
import app from '../api/_lib/heidi-app.js'

const PORT = Number(process.env.PORT || 8788)
app.listen(PORT, () => console.log(`Heidi backend (local) on http://localhost:${PORT}`))
