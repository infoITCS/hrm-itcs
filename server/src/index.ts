import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import employeeRoutes from './routes/employeeRoutes';
import { initScheduler } from './services/scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Scheduler
initScheduler();

app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: 'hrm'
})
    .then(() => console.log('Connected to MongoDB (hrm)'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Routes
app.use('/api/employees', employeeRoutes);

app.get('/', (req, res) => {
    res.send('HRM API is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
