// Synthetic outputs of the macOS commands behind tools/lib/host.mjs hostPower() (T8+, incident I-033), in the
// formats of macOS 26 (`pmset -g systemstate`, `pmset -g ps`, `pmset -g assertions`, and the JXA one-liner
// `$.CGDisplayIsAsleep($.CGMainDisplayID())` through osascript). Made up for the tests: no real machine state,
// pids, device ids or names. tests/fixtures/fake-host.mjs builds its sampler answers from these.

/** pmset -g systemstate: FullWake has the Graphics capability; DarkWake (maintenance wake) has not. */
export const systemState = (fullWake = true) =>
  `Current System Capabilities are: ${fullWake ? 'CPU Graphics Audio Network' : 'CPU Network'} \nCurrent Power State: 4\n`;

/** pmset -g ps */
export const powerSource = (ac = true) => (ac
  ? "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)\t100%; charged; 0:00 remaining present: true\n"
  : "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t57%; discharging; 4:12 remaining present: true\n");

/**
 * pmset -g assertions. displayAssert: count of PreventUserIdleDisplaySleep (caffeinate -d holds one);
 * the per-process list below must not be read as the system-wide counts.
 */
export const assertions = ({ displayAssert = 1, systemAssert = 1, userActive = 1 } = {}) => `2026-10-01 18:18:16 +0700
Assertion status system-wide:
   BackgroundTask                 0
   ApplePushServiceTask           0
   UserIsActive                   ${userActive}
   PreventUserIdleDisplaySleep    ${displayAssert}
   SoftwareUpdateTask             0
   PreventSystemSleep             ${systemAssert}
   ExternalMedia                  0
   InternalPreventDisplaySleep    ${displayAssert}
   PreventUserIdleSystemSleep     ${systemAssert}
   NetworkClientActive            0
Listed by owning process:
   pid 1111(caffeinate): [0x0000000100018bd8] 00:00:08 PreventUserIdleSystemSleep named: "caffeinate command-line tool"
\tDetails: caffeinate asserting for 300 secs
   pid 2222(caffeinate): [0x0000000200018bd9] 00:01:50 PreventUserIdleDisplaySleep named: "caffeinate command-line tool"
   pid 3333(sharingd): [0x0000000300018b5a] 00:02:34 PreventUserIdleSystemSleep named: "Handoff"
Kernel Assertions: 0x4=USB
   id=500  level=255 0x4=USB mod=1/1/26, 9:00 AM description=com.apple.usb.externaldevice.01100000 owner=Example Hub
Idle sleep preventers: IODisplayWrangler
`;

/** osascript -l JavaScript -e '$.CGDisplayIsAsleep($.CGMainDisplayID())': prints the boolean as 0 / 1 (or true / false). */
export const displayAsleep = (on = true) => (on ? '0\n' : '1\n');
