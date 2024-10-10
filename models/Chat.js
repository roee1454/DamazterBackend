import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Chat = sequelize.define('Chat', {  // Provide model name as the first argument
    id: {
        primaryKey: true,
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "title",
        validate: {
            notEmpty: true,
        },
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
    timestamps: true
});

export default Chat;
