const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(uri, { dbName: 'hrm' });
    const emps = await mongoose.connection.db.collection('employees').find({
        attachments: { $exists: true, $not: { $size: 0 } }
    }).toArray();
    
    console.log(JSON.stringify(emps.map(e => ({
        name: `${e.firstName} ${e.lastName}`,
        attachments: e.attachments.map(a => ({
            id: a._id,
            name: a.fileName,
            type: a.fileType
        }))
    })), null, 2));
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
