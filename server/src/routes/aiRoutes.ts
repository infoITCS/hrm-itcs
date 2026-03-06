import express, { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticate } from '../middleware/auth';
import multer from 'multer';
// pdf requirement moved inside the route handler to prevent top-level load issues

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

        console.log(`[AI] Processing file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Using 2.5-flash as 2.0-flash quota is 0 for this key and 1.5 is missing
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let content: string | Buffer = '';
        let isImage = file.mimetype.startsWith('image/');
        
        if (file.mimetype === 'application/pdf') {
            try {
                console.log(`[AI] Debug: Checking PDF library...`);
                // Ensure pdf library is available
                const pdfLib = require('pdf-parse');
                const parsePdf = typeof pdfLib === 'function' ? pdfLib : (pdfLib.default || null);
                
                if (typeof parsePdf !== 'function') {
                    throw new Error('PDF parsing engine is not a function');
                }

                console.log(`[AI] Starting PDF extraction...`);
                const data = await parsePdf(file.buffer);
                content = data.text;
                
                if (!content) {
                    throw new Error('No text content found in PDF');
                }
                console.log(`[AI] PDF extracted, text length: ${content.length}`);
            } catch (pdfErr: any) {
                console.error('[AI] PDF Processing failed:', pdfErr);
                return res.status(500).json({ 
                    message: 'Could not read PDF. Try uploading a clear image or manually typing.',
                    error: pdfErr.message 
                });
            }
        } else if (isImage) {
            content = file.buffer.toString('base64');
            console.log(`[AI] Image converted to base64`);
        } else {
            content = file.buffer.toString('utf-8');
            console.log(`[AI] Text file read, length: ${content.length}`);
        }

        const prompt = `
            You are an HR Data Entry Specialist. Extract information from this ${file.mimetype} document (it might be a Resume, CNIC, or ID Card).
            Return the information as a CLEAN JSON object matching this schema:
            {
                "firstName": "String",
                "lastName": "String",
                "middleName": "String",
                "fatherName": "String",
                "cnic": "12345-1234567-1",
                "dateOfBirth": "YYYY-MM-DD",
                "gender": "Male or Female",
                "nationality": "String",
                "religion": "String",
                "maritalStatus": "Single/Married/Divorced/Widowed",
                "bloodGroup": "A+/B-/etc",
                "email": "String",
                "phone": "String",
                "domicile": "City/District",
                "address": {
                    "street": "String",
                    "city": "String",
                    "state": "String",
                    "zipCode": "String",
                    "country": "String"
                },
                "education": [
                    { "level": "e.g. Bachelor", "institute": "e.g. NUST", "year": "e.g. 2022", "score": "e.g. 3.5 CGPA" }
                ],
                "skills": ["Array", "of", "Skills"],
                "employmentHistory": [
                    { "companyName": "String", "jobTitle": "String", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD or Present", "reasonForLeaving": "String" }
                ],
                "bankDetails": {
                    "bankName": "String",
                    "accountName": "String",
                    "accountNumber": "String",
                    "iban": "String",
                    "swiftCode": "String"
                },
                "socialProfiles": [
                    { "platform": "LinkedIn", "link": "http://..." },
                    { "platform": "GitHub", "link": "http://..." },
                    { "platform": "Portfolio", "link": "http://..." }
                ],
                "emergencyContacts": [
                    { "name": "String", "relation": "String", "phone": "String" }
                ]
            }
            Rules:
            1. If a field is not found, use an empty string or empty array.
            2. Only return the JSON. No preamble, no markdown formatting.
            3. For CNIC, ensure the format is xxxxx-xxxxxxx-x.
            4. For Dates, look for keywords like "DOB", "Birth Date", "Date of Birth", "Joined", "Left".
            5. Extract EVERYTHING useful you find in the text. Be thorough.
        `;

        console.log(`[AI] Sending request to Gemini...`);
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
        console.log(`[AI] Raw response received:`, text.substring(0, 50) + '...');
        
        // Clean up markdown if AI included it
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const extractedData = JSON.parse(cleanedText);
            console.log(`[AI] Successfully parsed JSON structure.`);
            res.json(extractedData);
        } catch (parseErr) {
            console.error('[AI] Response Parsing Error. Raw text:', text);
            res.status(500).json({ message: 'Failed to process AI response: ' + parseErr });
        }
    } catch (err: any) {
        console.error('[AI] Extraction Error:', err);
        res.status(500).json({ message: 'AI Extraction failed: ' + err.message });
    }
});

export default router;
