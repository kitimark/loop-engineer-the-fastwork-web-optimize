#!/usr/bin/env node
// Stand-in for `ideviceinfo -u <udid> -k DeviceName` in the `iphone.mjs wda build` tests ($FW_IDEVICEINFO):
// prints the phone's name. Not of the "<Someone>'s iPhone" shape on purpose, so only the known-value layer of
// tools/lib/redact.mjs can scrub it (review-gesture 2). FAKE_DEVICE_NAME overrides it.
console.log(process.env.FAKE_DEVICE_NAME || 'Kitchen Phone 7');
