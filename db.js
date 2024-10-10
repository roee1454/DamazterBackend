import { Sequelize } from 'sequelize';

const dbPath = "../database.db"

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
});

export default sequelize;
