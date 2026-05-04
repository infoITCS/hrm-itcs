import { processEmployeePunches } from '../src/services/attendanceProcessor';
import AttendanceRecord from '../src/models/AttendanceRecord';
import DeviceLocation from '../src/models/DeviceLocation';
import AttendancePunch from '../src/models/AttendancePunch';
import Employee from '../src/models/Employee';

// Mock dependencies
jest.mock('../src/models/AttendanceRecord');
jest.mock('../src/models/DeviceLocation');
jest.mock('../src/models/AttendancePunch');
jest.mock('../src/models/Employee');

describe('AttendanceProcessor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should calculate late time and early leave correctly when check-in is late', async () => {
        // Setup mock device config for shift times
        (DeviceLocation.findOne as jest.Mock).mockResolvedValue({
            deviceSN: 'DEV01',
            shiftStart: '09:00',
            shiftEnd: '17:00'
        });

        // Setup mock punches
        (AttendancePunch.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockResolvedValue([
                { punchTime: new Date('2023-10-10T09:30:00Z'), punchState: '0' },
                { punchTime: new Date('2023-10-10T16:30:00Z'), punchState: '1' }
            ])
        });

        const mockSave = jest.fn().mockResolvedValue(true);
        const mockRecord = {
            employeeId: 'EMP01',
            checkIn: new Date('2023-10-10T09:30:00Z'),
            checkOut: new Date('2023-10-10T16:30:00Z'),
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            save: mockSave
        };
        // Setup mock existing attendance record
        (AttendanceRecord.findOne as jest.Mock).mockResolvedValue(mockRecord);

        // Process punches
        const result = await processEmployeePunches('EMP01', '2023-10-10', 'DEV01');

        // Verify that the attendance record was queried for updating
        expect(AttendanceRecord.findOne).toHaveBeenCalledWith({
            employeeId: 'EMP01',
            date: '2023-10-10'
        });
        
        expect(mockRecord.lateMinutes).toBe(30);
        expect(mockRecord.earlyLeaveMinutes).toBe(30);
        expect(mockSave).toHaveBeenCalled();
        expect(result).toBe(mockRecord);
    });
});
