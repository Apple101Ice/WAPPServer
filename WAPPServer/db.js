const { Pool } = require("pg");
const { users, usersContact } = require("./UsersData");

const TABLES_NAME = {
    TABLE_USERS: "users",
    TABLE_USERSCONTACT: "userscontact",
    TABLE_USERSGROUP: "usersgroup",
    TABLE_CHATMEDIA: "chatmedia",
};

const pool = new Pool({
    connectionString: 'postgres://wappdb_user:VIaoW6sURY1QM4vd7ROWGwM6bsbdwGbN@dpg-cjpefue1208c73a1tec0-a.singapore-postgres.render.com/wappdb',
    ssl: {
        rejectUnauthorized: false,
    },
    port: process.env.PORT || 5432,
});


pool.on("connect", () => {
    console.log("Connected to the database");
});

pool.on("error", (err) => {
    console.error("Error connecting to the database:", err);
});

const testDatabaseConnection = async () => {
    try {
        const client = await pool.connect();
        console.log("Database connection test successful");
        client.release();
    } catch (error) {
        console.error("Error testing database connection:", error);
        throw error;
    }
};

const initializeDatabase = async () => {
    try {
        await checkTableIfExist(TABLES_NAME.TABLE_USERS, createUsersTable());
        const { rows: userRowCount } = await pool.query(
            `SELECT COUNT(*) FROM users`
        );
        if (userRowCount[0].count === "0") {
            await insertData(TABLES_NAME.TABLE_USERS, users);
        } else {
            console.log("Users table already has data, skipping data insertion");
        }

        await checkTableIfExist(
            TABLES_NAME.TABLE_USERSCONTACT,
            createUsersContactTable()
        );
        const { rows: usersContactRowCount } = await pool.query(
            `SELECT COUNT(*) FROM userscontact`
        );
        if (usersContactRowCount[0].count === "0") {
            await insertData(TABLES_NAME.TABLE_USERSCONTACT, usersContact);
        } else {
            console.log(
                "UsersContact table already has data, skipping data insertion"
            );
        }

        await checkTableIfExist(
            TABLES_NAME.TABLE_USERSGROUP,
            createUsersGroupTable()
        );

        await checkTableIfExist(
            TABLES_NAME.TABLE_CHATMEDIA,
            createChatMediaTable()
        );

        console.log("Database initialization complete");
    } catch (error) {
        console.error("Error initializing database:", error);
    }
};

const insertData = async (tableName, dataArray) => {
    let client;

    try {
        client = await pool.connect();
        const columns = Object.keys(dataArray[0]).join(", ");
        const placeholders = dataArray
            .map((_, rowIndex) => {
                return `(${Array(Object.keys(dataArray[0]).length)
                    .fill("")
                    .map(
                        (_, colIndex) =>
                            `$${rowIndex * Object.keys(dataArray[0]).length + colIndex + 1}`
                    )
                    .join(", ")})`;
            })
            .join(", ");
        const values = dataArray.flatMap((item) => Object.values(item));

        const insertQuery = `INSERT INTO ${tableName} (${columns}) VALUES ${placeholders}`;

        await client.query(insertQuery, values);
        console.log(`Data inserted successfully into ${tableName}`);
    } catch (error) {
        console.error(`Error inserting data into ${tableName}:`, error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const createTableIfNotExists = async (tableName, createTableQuery) => {
    try {
        const client = await pool.connect();
        await client.query(
            `CREATE TABLE IF NOT EXISTS ${tableName} ${createTableQuery}`
        );
        console.log(`${tableName} table created or already exists`);
        client.release();
    } catch (error) {
        console.error(`Error creating or checking ${tableName} table:`, error);
        throw error;
    }
};

const checkTableIfExist = async (tableName, createTableQuery) => {
    try {
        const { rows: tableCheckResult } = await pool.query(
            `
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = $1
            );
        `,
            [tableName]
        );

        if (tableCheckResult[0].exists === false) {
            await createTableIfNotExists(tableName, createTableQuery);
        } else {
            console.log(`${tableName} table created or already exists`);
        }
    } catch (error) {
        console.error(`Error checking or inserting data in ${tableName}:`, error);
    }
};

const getTableData = async (tableName) => {
    try {
        const getQuery = `SELECT * FROM ${tableName}`;

        return await pool.query(getQuery);
    } catch (error) {
        console.error(`Error retrieving data from ${tableName}:`, error);
        throw error;
    }
};

const insertChatMedia = async (
    uniqueid,
    message,
    fileinfo = {},
    binaryData = null
) => {
    try {
        const insertQuery =
            "INSERT INTO chatmedia (uniqueid, sendername, receivername, sender, receiver, groupmessage, groupuniqueid, chatmessage, timestamp, data, fileinfo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";

        const {
            sendername,
            receivername,
            sender,
            receiver,
            groupmessage,
            groupuniqueid,
            chatmessage,
            timestamp,
        } = message;

        await pool.query(insertQuery, [
            uniqueid,
            sendername,
            receivername,
            sender,
            receiver,
            groupmessage,
            groupuniqueid,
            chatmessage,
            timestamp,
            binaryData,
            fileinfo,
        ]);
        console.log("Media inserted successfully");
    } catch (error) {
        console.error("Error inserting media:", error);
        throw error;
    }
};

const deleteChatMedia = async (uniqueid) => {
    try {
        const deleteQuery = "DELETE FROM chatmedia WHERE uniqueid = $1";

        await pool.query(deleteQuery, [uniqueid]);
        console.log("Media deleted successfully");
    } catch (error) {
        console.error("Error deleting media:", error);
        throw error;
    }
};

const getChatData = async (sender, receiver) => {
    try {
        const getQuery =
            "SELECT * FROM chatmedia WHERE (sender = $1 OR sender = $2) AND (receiver = $1 OR receiver = $2) AND groupmessage = 'false'";

        return await pool.query(getQuery, [sender, receiver]);
    } catch (error) {
        console.error("Error retrieving chat data:", error);
        throw error;
    }
};

const getGroupChatData = async (groupuniqueid) => {
    try {
        const getQuery =
            "SELECT * FROM chatmedia WHERE groupuniqueid = $1 AND groupmessage = 'true'";

        return await pool.query(getQuery, [groupuniqueid]);
    } catch (error) {
        console.error("Error retrieving chat data:", error);
        throw error;
    }
};

const updateData = async (tableName, updateArray, condition) => {
    let client;

    try {
        client = await pool.connect();

        const setClause = Object.keys(updateArray[0])
            .map((column, index) => `${column} = $${index + 1}`)
            .join(", ");

        const values = updateArray.flatMap((item) => Object.values(item));

        const updateQuery = `UPDATE ${tableName} SET ${setClause} WHERE ${condition}`;

        await client.query(updateQuery, values);

        console.log(`Data updated successfully in ${tableName}`);
    } catch (error) {
        console.error(`Error updating data in ${tableName}:`, error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const deleteGroup = async (tableName, id) => {
    try {
        const deleteQuery = `DELETE FROM ${tableName} WHERE id = $1`;

        return await pool.query(deleteQuery, [id]);
    } catch (error) {
        console.error("Error deleting group:", error);
        throw error;
    }
};

const resetDatabase = async () => {
    try {
        for (const table of Object.keys(TABLES_NAME)) {
            const dropQuery = `DROP TABLE ${TABLES_NAME[table]}`;
            await pool.query(dropQuery);
        }
        await initializeDatabase();
        console.log("Database reset successfully.");
    } catch (error) {
        console.error("Error dropping table:", error);
        throw error;
    }
};

const createUsersTable = () => `
    (id SERIAL PRIMARY KEY,
    userimage BYTEA,
    fileinfo JSON,
    contacttype VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(255) NOT NULL UNIQUE);
`;

const createUsersContactTable = () => `
    (id SERIAL PRIMARY KEY,
    mobile VARCHAR(255) NOT NULL UNIQUE,
    contacts JSON[],
    memberof TEXT[]);
`;

const createChatMediaTable = () => `
    (id SERIAL PRIMARY KEY,
    uniqueid VARCHAR(255) NOT NULL,
    sendername VARCHAR(255) NOT NULL,
    receivername VARCHAR(255) NOT NULL,
    sender VARCHAR(255) NOT NULL,
    receiver VARCHAR(255) NOT NULL,
    groupmessage VARCHAR(255) NOT NULL,
    groupuniqueid VARCHAR(255),
    chatmessage TEXT,
    timestamp VARCHAR(255) NOT NULL,
    data BYTEA,
    fileinfo JSON);
`;

const createUsersGroupTable = () => `
    (id SERIAL PRIMARY KEY,
    uniqueid VARCHAR(255) NOT NULL UNIQUE,
    groupimage BYTEA,
    fileinfo JSON,
    contacttype VARCHAR(255) NOT NULL,
    mobile VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    adminname VARCHAR(255) NOT NULL,
    members JSONB[]);
`;

module.exports = {
    testDatabaseConnection,
    initializeDatabase,
    getTableData,
    insertData,
    insertChatMedia,
    deleteChatMedia,
    getChatData,
    getGroupChatData,
    updateData,
    deleteGroup,
    resetDatabase,
    TABLES_NAME,
};
