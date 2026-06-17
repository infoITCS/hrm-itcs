const dotenv = require('../node_modules/dotenv');
const mongoose = require('../node_modules/mongoose');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in .env");
    return;
  }
  
  console.log("Connecting to database...");
  await mongoose.connect(uri, { dbName: 'hrm' });
  console.log("Connected successfully.");

  // Fetch all attendance records where employeeId is a 24-character hex ObjectId
  const hexPattern = /^[0-9a-fA-F]{24}$/;
  const records = await mongoose.connection.db.collection('attendancerecords').find().toArray();
  const incorrectRecords = records.filter(r => hexPattern.test(r.employeeId));

  console.log(`Found ${incorrectRecords.length} incorrect records with ObjectId as employeeId.`);

  let fixedCount = 0;

  for (const record of incorrectRecords) {
    // Find matching employee by userId or _id
    const employee = await mongoose.connection.db.collection('employees').findOne({
      $or: [
        { userId: record.employeeId },
        { _id: new mongoose.Types.ObjectId(record.employeeId) }
      ]
    });

    if (!employee) {
      console.warn(`Could not find employee for ID: ${record.employeeId}`);
      continue;
    }

    const targetEmpId = employee.employeeId;
    console.log(`Processing date ${record.date} for employee ${employee.firstName} ${employee.lastName} (${targetEmpId})`);

    // Check if duplicate record exists for this date under the readable ID
    const dupRecord = await mongoose.connection.db.collection('attendancerecords').findOne({
      employeeId: targetEmpId,
      date: record.date
    });

    if (dupRecord) {
      const punches = dupRecord.allPunches || [];
      if (punches.length > 0) {
        console.log(`- Duplicate found with punches. Deleting duplicate first, then merging punches into the On Leave record.`);
        // Delete duplicate record first to avoid unique index conflict
        await mongoose.connection.db.collection('attendancerecords').deleteOne({ _id: dupRecord._id });
        await mongoose.connection.db.collection('attendancerecords').updateOne(
          { _id: record._id },
          {
            $set: {
              employeeId: targetEmpId,
              allPunches: punches,
              checkIn: dupRecord.checkIn,
              checkOut: dupRecord.checkOut,
              workDurationMinutes: dupRecord.workDurationMinutes,
              lateMinutes: dupRecord.lateMinutes,
              overtimeMinutes: dupRecord.overtimeMinutes
            }
          }
        );
      } else {
        console.log(`- Duplicate found with no punches (e.g. Absent). Deleting duplicate first, then renaming On Leave record.`);
        await mongoose.connection.db.collection('attendancerecords').deleteOne({ _id: dupRecord._id });
        await mongoose.connection.db.collection('attendancerecords').updateOne(
          { _id: record._id },
          { $set: { employeeId: targetEmpId } }
        );
      }
    } else {
      console.log(`- No duplicate found. Renaming employeeId to ${targetEmpId}.`);
      await mongoose.connection.db.collection('attendancerecords').updateOne(
        { _id: record._id },
        { $set: { employeeId: targetEmpId } }
      );
    }

    fixedCount++;
  }

  console.log(`Database correction completed. Fixed ${fixedCount} records.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
