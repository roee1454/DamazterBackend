// models/Prompt.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Prompt = sequelize.define('Prompt', {
    question: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    response: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
            notEmpty: true,
            notNull: true,
        }
    },
    chatId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
        validate: {
            notEmpty: true,
            notNull: true
        }
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    timestamps: true,  // Enable timestamps to automatically manage createdAt and updatedAt
});

export default Prompt;
