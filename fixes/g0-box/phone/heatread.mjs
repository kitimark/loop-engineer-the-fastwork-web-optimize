#!/usr/bin/env node
// P-165 heat probe (user T-247 #7): prints the iPhone's battery temperature in °C (one number, or nothing when there
// is no read). Reads AppleSmartBattery through the tools' own batteryInfo (idevicediagnostics, no lease, no page work);
// prints the temperature only, never a device field. Used by p165-hold.sh around every heat run (HEATRATE lines).
import { batteryInfo } from '../../../tools/lib/iphone-run.mjs';
const b = batteryInfo();
if (typeof b.temperatureC === 'number') console.log(b.temperatureC);
