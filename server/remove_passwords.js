require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'hrm' });
    const db = mongoose.connection.db;
    const result = await db.collection('users').updateMany(
        { microsoftId: { $exists: true } },
        { $unset: { password: "" } }
    );
    console.log("Updated", result.modifiedCount, "users by removing dummy passwords");
    process.exit(0);
}

run().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
