from enum import Enum

class CALIBRATION_STEPS_5790B(int, Enum):
    ASFOUND = 1
    ADJUST = 2
    ASLEFT = 3
    ASNIST = 4

class CALIBRATION_STATUS_5790B(int, Enum):
    INIT = 0
    ASFOUND = 1
    ADJUST = 2
    ASLEFT = 3
    ASNIST = 4
    DONE = 5

class STANDARD_LABELS_5790B(int, Enum):
    SOURCE = 1
    DMM = 2
    WVS = 3
    FC = 4
    AMP = 5
    TS = 6
    RS = 7
    EM = 8

class MESSAGE_TYPE_5790B(int, Enum):
    (
        ERROR,
        ACK,
        LOG,

        CREATE_NEW_CAL,
        RESUME_OLD_CAL,
        GET_CAL_DETAILS,
        
        GET_INST_DETAILS,
        POST_INST_DETAILS,
        SAVE_INSTRUMENTS,
        SCAN_INSTRUMENTS,
        ZERO_INSTRUMENTS,
        ZERO_5790B,
        ZERO_5730A,
        ZERO_3458A,
        TENV_3458A,
        GET_TEST_POINTS,

        DOWNLOAD_INITIAL_REPORTS,
        DOWNLOAD_FINAL_REPORTS,
        GET_STORED,
        GET_ACTIVE,

        START_CALIBRATION,
        STOP_CALIBRATION,

        SELECT_TEST_POINTS,
        SAVE_SETTINGS,
        SAVE_CORRECTIONS_DC,
        SAVE_CORRECTIONS_AC,
        SAVE_CORRECTIONS_WB,
        SAVE_CORRECTIONS_NIST_WB,

        EXPORT_NIST_CORRECTION,

        COMMAND_TESTING_PANEL,
        ON_CONNECT,
        MOTION_COMPLETE,

        MEASUREMENT_DATA,
        TEST_POINT_DATA,
        TEST_POINT_COMPLETE,
        STEP_COMPLETE,

        WARNING,
        WARNING_RESPONSE,

     ) = range(38)
