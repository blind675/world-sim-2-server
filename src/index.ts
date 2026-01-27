import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthCheckRouter from './routes/healthCheck';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', healthCheckRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/api/health-check`);
});
