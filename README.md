# Done Deal Digital Backend

Backend API for Done Deal Digital ecommerce platform featuring merch store, beats store, chatbot, and artist client portal.

## 🏗️ Project Structure

```
src/
├── config/          # Database and environment configuration
├── middleware/      # Authentication, error handling, validation
├── models/          # Database query classes
├── routes/          # API endpoints
├── services/        # External API integrations (Stripe, OpenAI, AWS)
├── utils/           # Helper functions (JWT, formatters, etc)
└── app.js           # Express server setup
```

## 🚀 Getting Started

### Prerequisites
- Node.js 14+ 
- PostgreSQL 12+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Initialize database (when available)
npm run migrate

# Start development server
npm run dev
```

The server will start at `http://localhost:5000`

### Health Check

```bash
curl http://localhost:5000/health
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` — Create new account
- `POST /api/auth/login` — User login
- `POST /api/auth/logout` — User logout
- `POST /api/auth/refresh` — Refresh JWT token

### Users
- `GET /api/users/profile` — Get current user profile
- `PUT /api/users/profile` — Update profile
- `GET /api/users/:id` — Get public user profile

### Products
- `GET /api/products` — List all products
- `GET /api/products/:id` — Get product details

### Beats
- `GET /api/beats` — List all beats
- `GET /api/beats/:id` — Get beat details
- `POST /api/beats` — Upload beat (artist only)

### Orders
- `GET /api/orders` — Get user's orders
- `POST /api/orders` — Create new order
- `GET /api/orders/:id` — Get order details

### Payments
- `POST /api/payments/create-intent` — Create Stripe PaymentIntent
- `POST /api/payments/webhook` — Stripe webhook handler

### Downloads
- `POST /api/downloads/:beatId` — Generate download link
- `POST /api/downloads/stems` — Download beat stems

### Chat
- `POST /api/chat/message` — Send message to chatbot
- `GET /api/chat/history` — Get conversation history

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for stateless authentication.

- **Access Token**: Short-lived (7 days), used for API requests
- **Refresh Token**: Long-lived (30 days), stored in httpOnly cookie

Include access token in requests:
```
Authorization: Bearer <accessToken>
```

## 📦 Dependencies

- **express**: Web framework
- **pg**: PostgreSQL client
- **jsonwebtoken**: JWT authentication
- **bcryptjs**: Password hashing
- **stripe**: Payment processing
- **cors**: Cross-origin resource sharing
- **helmet**: Security headers
- **morgan**: HTTP request logging

## 🧪 Testing

```bash
npm test
```

## 📚 Database Schema

See `PHASE_2B_PLANNING.md` for complete schema documentation.

Core tables:
- `users` — User accounts and profiles
- `products` — Merchandise inventory
- `beats` — Music beats and licensing
- `orders` — Customer orders and transactions
- `beat_purchases` — Beat purchase history and downloads
- `conversations` — Chatbot conversation logs

## 🚀 Deployment

See deployment guide for hosting options:
- AWS Elastic Beanstalk
- Railway
- Render
- DigitalOcean

## 📝 Environment Variables

See `.env.example` for all required variables.

Key variables:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — PostgreSQL
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — JWT signing keys
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Payment processing
- `AWS_*` — S3 file storage
- `FRONTEND_URL` — CORS origin

## 🐛 Debugging

Check logs with:
```bash
LOG_LEVEL=debug npm run dev
```

## 📞 Support

For issues, questions, or feature requests, contact the development team.

---

**Status**: Phase 2B.1 Foundation — Basic server structure, user authentication, and API scaffold complete. Merch store and beats store integration coming next.

Last Updated: May 18, 2026
