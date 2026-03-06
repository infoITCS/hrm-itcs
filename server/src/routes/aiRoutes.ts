import express, { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticate } from '../middleware/auth';
import multer from 'multer';
const pdf = require('pdf-parse');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/extract', authenticate, upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error('AI Extraction Error: GEMINI_API_KEY not configured in .env');
            return res.status(500).json({ message: 'AI features are not configured. Please contact admin.' });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let content: string | Buffer = '';
        let isImage = file.mimetype.startsWith('image/');
        
        if (file.mimetype === 'application/pdf') {
            const data = await pdf(file.buffer);
            content = data.text;
        } else if (isImage) {
            content = file.buffer.toString('base64');
        } else {
            content = file.buffer.toString('utf-8');
        }

        const prompt = `
            You are an HR Data Entry Specialist. Extract information from this ${file.mimetype} document (it might be a Resume, CNIC, or ID Card).
            Return the information as a CLEAN JSON object matching this schema:
            {
                "firstName": "String",
                "lastName": "String",
                "cnic": "format 12345-1234567-1 (extract accurately)",
                "dateOfBirth": "YYYY-MM-DD",
                "fatherName": "String",
                "gender": "Male or Female",
                "nationality": "String",
                "email": "String (if found)",
                "phone": "String (if found)"
            }
            Rules:
            1. If a field is not found, use an empty string.
            2. Only return the JSON. No preamble, no markdown formatting.
            3. For CNIC, ensure the format is xxxxx-xxxxxxx-x.
        `;

        let result;
        if (isImage) {
            result = await model.generateContent([
                prompt,
                { inlineData: { data: content as string, mimeType: file.mimetype } }
            ]);
        } else {
            result = await model.generateContent(prompt + "\n\nTEXT CONTENT:\n" + content);
        }

        const response = await result.response;
        const text = response.text();
        
        // Clean up markdown if AI included it
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const extractedData = JSON.parse(cleanedText);
            res.json(extractedData);
        } catch (parseErr) {
            console.error('AI Response Parsing Error:', text);
            res.status(500).json({ message: 'Failed to process AI response: ' + parseErr });
        }
    } catch (err: any) {
        console.error('AI Extraction Error:', err);
        res.status(500).json({ message: 'AI Extraction failed: ' + err.message });
    }
});

export default router;
