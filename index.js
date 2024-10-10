import path from 'path';
import fs from 'fs/promises';
import { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from 'dotenv';
import sequelize from './db.js';
import Prompt from './models/Prompt.js';
import Chat from './models/Chat.js';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import * as csvParse from 'csv-parse';
import mammoth from 'mammoth';

config();

const __dirname = "C:/Users/roee1/.cache/lm-studio/models/dicta-il/dictalm2.0-instruct-GGUF";
const __filename = "dictalm2.0-instruct.Q4_K_M.gguf";

const modelPath = path.join(__dirname, __filename);

const model = new LlamaModel({ modelPath });
const context = new LlamaContext({ model });
const session = new LlamaChatSession({ context });

const app = express();

app.use(express.json());
app.use(cors());

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/', preservePath: true });

// Function to read and process different file types
const processFile = async (filePath) => {
    let fileContent = '';

    console.log(filePath)

    const fileExtension = path.extname(filePath);

    try {
        switch (fileExtension.toLowerCase()) {
            case '.txt':
            case '.js':
            case '.ts':
            case '.py':
                fileContent = await fs.readFile(filePath, 'utf-8');
                break;

            case '.docx':
                const docxResult = await mammoth.extractRawText({ path: filePath });
                fileContent = docxResult.value;
                break;

            case '.pdf':
                const pdfBuffer = await fs.readFile(filePath);
                const pdfData = await pdfParse(pdfBuffer);
                fileContent = pdfData.text;
                break;

            case '.csv':
                const csvData = await fs.readFile(filePath, 'utf-8');
                csvParse(csvData, { columns: true }, (err, output) => {
                    if (err) throw err;
                    fileContent = JSON.stringify(output, null, 2);
                });
                break;

            case '.xlsx':
                const workbook = XLSX.readFile(filePath);
                const sheetNames = workbook.SheetNames;
                const sheet = workbook.Sheets[sheetNames[0]];
                fileContent = XLSX.utils.sheet_to_json(sheet, { header: 1 }).map(row => row.join(',')).join('\n');
                break;

            default:
                throw new Error('Unsupported file type: ' + fileExtension);
        }
    } catch (err) {
        throw new Error(`Error processing file: ${err.message}`);
    }

    return fileContent;
};

app.get("/chat", async (req, res) => {
    try {
        const chats = await Chat.findAll();
        return res.status(200).json({ chats });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

app.get("/chat/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const chat = await Chat.findByPk(id);
        return res.status(200).json({ chat });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

app.get("/prompts/:chatId", async (req, res) => {
    const { chatId } = req.params;
    try {
        const prompts = await Prompt.findAll({
            where: { chatId }
        });
        return res.status(200).json({ prompts });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

// Middleware to create a chat session
const createChatSession = async (req, res, next) => {
    const { question } = req.body;
    try {
        const id = crypto.randomUUID();
        const createdAt = new Date(Date.now());
        await Chat.create({ id, createdAt, updatedAt: createdAt, title: question });
        req.chatId = id;
        next();
    } catch (error) {
        return res.status(500).json({ error: 'Error creating chat session', details: error.message });
    }
};

// Combined endpoint
app.post("/chat", upload.single('file'), createChatSession, async (req, res) => {
    const { question, maxTokens = 700, temperature = 0.7, topP = 0.9 } = req.body;
    const { chatId } = req;

    let fileContent = '';

    if (req.file) {
        try {
            fileContent = await processFile(req.file.path);
            console.log(fileContent);
            console.log(`File uploaded and read: ${req.file.originalname}`);
        } catch (err) {
            return res.status(501).json({ error: 'Error reading file', details: err.message });
        }
    }

    try {
        let prompt = `
אתה מודל של בינה מלאכותית שתפקידך הוא לעזור להבין ולנתח קבצים ומידע לפי הקלט שניתן לך.
תפעל לפי ההנחיות הבאות:
1. התשובות שלך יהיו אך ורק בעברית.
2. תהיה ממוקד ותן תשובה אחת בלבד על מנת לחסוך בטוקנים.
3. כאשר יש קובץ מצורף, תתייחס אליו כחלק מהמידע ותכלול אותו בתשובתך.
4. התשובות שלך יסתמכו על המידע הרלוונטי בלבד מתוך הקובץ או השאלה שהוצגה לך.
5. אם ישנם קטעי קוד, תתייחס אליהם בהתאם לתוכן השאלה ולמטרת הקובץ.

שאלה:
${question}\n\n
${fileContent ? `קובץ מצורף:\n"""${fileContent}"""\n` : ''}
`;

        // Truncate prompt if it exceeds a certain length
        const maxLength = 4000;  // Set appropriate max length
        if (prompt.length > maxLength) {
            prompt = prompt.slice(0, maxLength) + '...';
        }

        // Assuming session.prompt is a function that generates the AI response
        const response = await session.prompt(prompt, { temperature, maxTokens, topP, chatId });

        // Save the prompt and response in the database
        await Prompt.create({
            question,
            response,
            chatId: chatId,  // Use the chat session ID from middleware
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return res.status(200).json({ message: "Prompt created successfully", response, chatId });
    } catch (err) {
        return res.status(500).json({ error: 'Error generating response', details: err.message });
    } finally {
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
                console.log(`File deleted: ${req.file.path}`);
            } catch (err) {
                console.error(`Error deleting file: ${req.file.path}`, err);
            }
        }
    }
});

app.post("/prompt/:chatId", upload.single('file'), async (req, res) => {
    const { question, maxTokens = 700, temperature = 0.7, topP = 0.9 } = req.body;
    const { chatId } = req.params;

    let fileContent = '';

    if (req.file) {
        try {
            fileContent = await processFile(req.file.path);
            console.log(fileContent);
            console.log(`File uploaded and read: ${req.file.originalname}`);
        } catch (err) {
            return res.status(501).json({ error: 'Error reading file', details: err.message });
        }
    }

    try {
        let prompt = `
אתה מודל של בינה מלאכותית שתפקידך הוא לעזור להבין ולנתח קבצים ומידע לפי הקלט שניתן לך.
תפעל לפי ההנחיות הבאות:
1. התשובות שלך יהיו אך ורק בעברית.
2. תהיה ממוקד ותן תשובה אחת בלבד על מנת לחסוך בטוקנים.
3. כאשר יש קובץ מצורף, תתייחס אליו כחלק מהמידע ותכלול אותו בתשובתך.
4. התשובות שלך יסתמכו על המידע הרלוונטי בלבד מתוך הקובץ או השאלה שהוצגה לך.
5. אם ישנם קטעי קוד, תתייחס אליהם בהתאם לתוכן השאלה ולמטרת הקובץ.

שאלה:
${question}
${fileContent ? `\n"""${fileContent}"""\n` : ''}
`;

        // Truncate prompt if it exceeds a certain length
        const maxLength = 4000;  // Set appropriate max length
        if (prompt.length > maxLength) {
            prompt = prompt.slice(0, maxLength) + '...';
        }

        // Assuming session.prompt is a function that generates the AI response
        const response = await session.prompt(prompt, { temperature, maxTokens, topP, chatId });

        // Save the prompt and response in the database
        await Prompt.create({
            question,
            response,
            chatId: chatId,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return res.status(200).json({ message: "Prompt created successfully", response });
    } catch (err) {
        return res.status(500).json({ error: 'Error generating response', details: err.message });
    } finally {
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
                console.log(`File deleted: ${req.file.path}`);
            } catch (err) {
                console.error(`Error deleting file: ${req.file.path}`, err);
            }
        }
    }
});

// Assuming your app.listen is already set up.
const port = process.env.PORT || 3000;

(async () => {
    try {
        // Sync all models with the database
        await sequelize.sync({ force: true });
        console.log('Database & tables created!');

        // Start the server
        app.listen(port, () => console.log(`App is running at:\nhttp://localhost:${port}`));
    } catch (error) {
        console.error('Error starting the application:', error);
    }
})();
