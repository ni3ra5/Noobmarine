/**
 * NOOBMARINE — Game Data
 * Control names, type definitions, and task display formatting.
 * (Mirror of server-side logic — used client-side for display only)
 */

const CONTROL_NAMES = [
  // Navigation & Propulsion (1-10)
  'MAIN BALLAST PUMP', 'DIVE PLANE ACTUATOR', 'STERN PLANE CONTROL',
  'RUDDER TRIM ADJUSTER', 'PROPULSION DRIVE CONTROL', 'SHAFT SPEED REGULATOR',
  'PORT THRUSTER OUTPUT', 'STARBOARD THRUSTER OUTPUT',
  'EMERGENCY PROPULSION SWITCH', 'TRIM TANK VALVE',
  // Depth & Pressure (11-20)
  'DEPTH PRESSURE GAUGE', 'HULL STRESS MONITOR', 'CRUSH DEPTH LIMITER',
  'BUOYANCY CONTROL VALVE', 'BALLAST TANK VENT', 'FLOOD CONTROL LEVER',
  'PRESSURE RELIEF VALVE', 'SEA CHEST INLET VALVE',
  'HYDROSTATIC SENSOR OVERRIDE', 'VARIABLE BALLAST INJECTOR',
  // Power & Reactor (21-30)
  'REACTOR COOLANT VALVE', 'CORE TEMPERATURE DIAL', 'PRIMARY COOLANT FLOW',
  'SECONDARY LOOP BYPASS', 'REACTOR SCRAM SWITCH', 'POWER DISTRIBUTION BOARD',
  'AUXILIARY POWER BUS', 'BATTERY RESERVE TOGGLE',
  'VOLTAGE REGULATOR DIAL', 'EMERGENCY GENERATOR SWITCH',
  // Weapons & Defense (31-40)
  'TORPEDO TUBE FLOOD VALVE', 'TUBE PRESSURE EQUALIZER', 'FIRE CONTROL SELECTOR',
  'WARHEAD ARMING SWITCH', 'COUNTERMEASURE EJECTOR', 'DECOY LAUNCH CONTROL',
  'MINE RELEASE TOGGLE', 'TUBE DOOR ACTUATOR',
  'FIRING SOLUTION LOCK', 'WEAPONS BAY PRESSURE',
  // Sonar & Sensors (41-50)
  'ACTIVE SONAR EMITTER', 'PASSIVE SONAR GAIN', 'SONAR FREQUENCY DIAL',
  'HYDROPHONE ARRAY SWITCH', 'TARGET TRACKING LOCK', 'BEARING RESOLUTION KNOB',
  'NOISE FILTER LEVEL', 'SONAR SWEEP RATE',
  'ECHO RETURN AMPLIFIER', 'TRANSDUCER DEPTH ADJUSTER',
  // Life Support (51-60)
  'OXYGEN PURGE VALVE', 'CO2 SCRUBBER CONTROL', 'AIR CIRCULATION FAN',
  'HUMIDITY REGULATOR', 'AIR FLOW RATE SLIDER', 'ATMOSPHERIC PRESSURE DIAL',
  'EMERGENCY O2 RELEASE', 'NITROGEN PURGE SWITCH',
  'CARBON FILTER BYPASS', 'CABIN PRESSURE EQUALIZER',
  // Communications (61-70)
  'RADIO FREQUENCY SELECTOR', 'ELF TRANSMITTER TOGGLE', 'PERISCOPE ANTENNA RAISE',
  'BURST TRANSMIT CONTROL', 'COMM ARRAY POWER SWITCH', 'SIGNAL ENCRYPTION KEY',
  'ACOUSTIC MODEM GAIN', 'UHF BAND SELECTOR',
  'MESSAGE BUFFER FLUSH', 'IFF TRANSPONDER TOGGLE',
  // Navigation Systems (71-80)
  'INERTIAL NAV RESET', 'GPS ANTENNA DEPLOY', 'CHART TABLE LIGHT',
  'COURSE CORRECTION DIAL', 'SPEED LOG CALIBRATION', 'MAGNETIC COMPASS ADJUST',
  'GYROCOMPASS SYNC', 'NAVAID SELECTOR',
  'WAYPOINT ENTRY DIAL', 'DEAD RECKONING OVERRIDE',
  // Damage Control (81-90)
  'FLOOD ALARM ACKNOWLEDGE', 'FIRE SUPPRESSION ZONE', 'WATERTIGHT DOOR SEAL',
  'BILGE PUMP SWITCH', 'EMERGENCY BLOW VALVE', 'DAMAGE CONTROL PANEL RESET',
  'COMPARTMENT ISOLATE TOGGLE', 'HALON SYSTEM ARM',
  'SMOKE DETECTOR OVERRIDE', 'HULL BREACH ALERT SILENCE',
  // Miscellaneous (91-100)
  'PERISCOPE RAISE CONTROL', 'MAST RETRACT SWITCH', 'EXTERNAL LIGHT TOGGLE',
  'PHOTONICS MAST PAN', 'SAIL PLANE ACTUATOR', 'ANCHOR RELEASE CONTROL',
  'TOWED ARRAY DEPLOY', 'KAPSTAN WINCH CONTROL',
  'DOCKING LIGHT SWITCH', 'EMERGENCY BEACON ARM',
];

const CONTROL_TYPES = [
  'toggle', 'button', 'dial', 'h-slider', 'v-slider',
  'multi-slider', 'number-wheel', 'stepper',
  'btn-sequence', 'sw-sequence', 'ring'
];

const CONTROL_LABELS = {
  'toggle':       'TOGGLE SWITCH',
  'button':       'ACTIVATION BUTTON',
  'dial':         'ROTARY DIAL',
  'h-slider':     'HORIZONTAL SLIDER',
  'v-slider':     'VERTICAL SLIDER',
  'multi-slider': 'EQUALIZER ARRAY',
  'number-wheel': 'NUMBER DRUM',
  'stepper':      'STEP CONTROL',
  'btn-sequence': 'SEQUENCE PAD',
  'sw-sequence':  'SWITCH SEQUENCE',
  'ring':         'CHARGE RING',
};

/**
 * Format a task value for display on the captain's task list.
 */
function formatTaskValue(type, value) {
  switch (type) {
    case 'toggle':       return value;
    case 'button':       return 'ACTIVATE';
    case 'dial':         return `${value}°`;
    case 'h-slider':
    case 'v-slider':     return `${value}%`;
    case 'multi-slider': return Array.isArray(value) ? value.join(', ') : value;
    case 'number-wheel': return String(value).padStart(2, '0');
    case 'stepper':      return String(value);
    case 'btn-sequence': return Array.isArray(value) ? value.join('-') : value;
    case 'sw-sequence':  return Array.isArray(value) ? value.join(', ') : value;
    case 'ring':         return `${value}%`;
    default:             return String(value);
  }
}
