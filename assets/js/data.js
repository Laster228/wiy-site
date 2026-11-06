/*
 * WIY content model — single source of truth for navigation, catalogue and
 * product pages. In the CMS: `domains` → taxonomy, `products` → post type.
 * Photos under assets/img/photo/placeholder-* are temporary mood images.
 */
window.WIY = window.WIY || {};

WIY.domains = [
  {
    id: 'cuas', name: 'cUAS', title: 'Counter-UAS',
    lead: 'Interceptor UAVs that defeat Shahed-type loitering munitions, jet-powered drones and reconnaissance wings — a cost-efficient layer of air defence.',
    cover: 'assets/img/photo/strila-field-antenna.webp',
  },
  {
    id: 'isr', name: 'ISR', title: 'Reconnaissance',
    lead: 'Rapid-deployment tactical reconnaissance UAVs with digital video links for real-time situational awareness.',
    cover: 'assets/img/photo/placeholder-isr-forest.webp',
  },
  {
    id: 'strike', name: 'Strike', title: 'Strike',
    lead: 'FPV and reusable multi-role strike platforms with protected FHSS links and day/thermal optics for contested environments.',
    cover: 'assets/img/pomsta-xv.webp',
  },
  {
    id: 'gcs', name: 'GCS & Software', title: 'Ground Control & Software',
    lead: 'The WIY Ground Control Station and software stack — radar integration, semi-autonomous cueing and real-time OSD for interceptor crews.',
    cover: 'assets/img/photo/gcs-van-dusk.webp',
  },
];

WIY.products = [
  /* ---------------- cUAS ---------------- */
  {
    slug: 'strila', name: 'STRILA', domain: 'cuas', role: 'Counter-UAV interceptor',
    headline: 'Battlefield-proven counter-UAV interceptor',
    tagline: 'A high-speed interceptor UAV built to defeat fast, highly manoeuvrable aerial targets including Shahed-136/131 loitering munitions and reconnaissance drones.',
    status: 'In service', nsn: true, flagship: true,
    image: 'assets/img/strila.webp',
    hero: 'assets/img/photo/strila-kits-snow.webp',
    kpis: [['415', 'km/h', 'Maximum speed'], ['34', 'km', 'Maximum range'], ['6000', 'm', 'Maximum altitude'], ['700', 'g', 'Payload capacity']],
    intro: [
      'Designed as a cost-effective interceptor for Shahed-class threats, STRILA is a fast-deployment, mobile system built to operate within existing air-defence environments. It relieves high-value systems such as Patriot from low-cost drone engagements, delivering an economically sustainable interception layer where it is needed most.',
      'Engineered for maximum mobility, operational efficiency and battlefield reliability, the WIY Ground Control Station integrates with radar systems to automatically direct STRILA interceptors toward detected targets. On-screen OSD prompts display real-time information, reducing operator workload and accelerating neutralisation.',
    ],
    story: {
      title: 'Restoring economic balance to air defence',
      text: 'Expendable loitering munitions like the Shahed-136 cost little more than a small car and are built for saturation attacks. Intercepting them with high-end missiles creates a cost imbalance adversaries deliberately exploit. STRILA is engineered to close this gap — precise, high-speed intercepts at a fraction of the cost, preserving high-value air-defence assets for the threats they were built for.',
      image: 'assets/img/photo/strila-crates.webp',
    },
    capabilities: [
      ['Operation mode', 'Radar cueing and WIY software guide STRILA semi-autonomously to the target sector. The operator takes manual control for the final approach.'],
      ['Target detection', 'At closer range the operator visually identifies the target using onboard daylight and thermal imaging cameras, supporting precise and confident engagement decisions.'],
      ['Interception', 'During the final approach the operator steers STRILA directly into the designated target, executing a precise kinetic intercept.'],
      ['GNSS-denied and EW-contested', 'Protected communication channels and in-flight frequency switching support stable control under active jamming, while radio-beacon navigation ensures mission continuity when GNSS is denied.'],
      ['Fast and mobile deployment', 'Compact package, no dedicated launch infrastructure. STRILA launches directly from the ground, enabling rapid setup from protected or confined positions.'],
      ['Reusability', 'STRILA can return and land safely whenever an intercept is not required or the mission changes, then be recharged and redeployed.'],
    ],
    specs: [
      ['Maximum take-off weight', '5.7 kg'], ['Payload', '700 g'], ['Cruise speed', '150–200 km/h'],
      ['Maximum speed', '415 km/h'], ['Maximum range (one way)', '34 km'], ['Flight time', '15 min'],
      ['Maximum altitude', '6 000 m'], ['Climb rate', '50 m/s'], ['Optical sensors', 'EO/IR with gimbal'],
    ],
    gallery: ['assets/img/photo/gcs-van-dusk.webp', 'assets/img/photo/news-strila-snow.webp', 'assets/img/photo/news-qs-wiy-dusk.webp'],
  },
  {
    slug: 'strila-2-lr', name: 'STRILA 2 LR', domain: 'cuas', role: 'Long-range interceptor',
    headline: 'Interception before the threat reaches the protected area',
    tagline: 'A long-range version of STRILA with increased range and endurance for engaging attack and reconnaissance UAVs at extended distances.',
    status: 'In development',
    image: 'assets/img/strila-2-lr.webp',
    kpis: [['50', 'km', 'Interception range'], ['30', 'min', 'Flight time'], ['310', 'km/h', 'Maximum speed'], ['500', 'g', 'Warhead']],
    intro: [
      'STRILA 2 LR combines rapid automatic take-off, autonomous navigation to the interception area and AI-assisted terminal guidance.',
      'Integration with WIY software, radars and other target-designation sources enables timely threat detection and precise guidance at extended ranges while reducing operator workload.',
    ],
    capabilities: [
      ['AI-assisted terminal guidance', 'Autonomous navigation to the interception area with AI-assisted final approach.'],
      ['Radar cueing', 'Integration with WIY software, radars and other target-designation sources.'],
      ['Instant video channel switching', 'The operator switches video feeds in flight without landing the drone.'],
    ],
    specs: [
      ['Tactical range', 'up to 25 km'], ['Interception range (radio control)', 'up to 50 km'], ['Maximum speed', '310 km/h'],
      ['Cruise speed', '130–200 km/h'], ['Flight time', '30 min'], ['Climb rate', '35 m/s'],
      ['Maximum altitude', '~6 000 m'], ['Warhead (HE)', '500 g'], ['Camera', 'Thermal + daylight, rotary dual module'],
    ],
  },
  {
    slug: 'spys', name: 'SPYS', domain: 'cuas', role: 'Jet-target interceptor',
    headline: 'Ukraine’s fastest interceptor',
    tagline: 'A high-speed interceptor UAV designed to neutralise jet-powered Shahed-type drones and other manoeuvring aerial targets.',
    status: 'Combat testing',
    image: 'assets/img/spys.webp',
    hero: 'assets/img/photo/spys-front.webp', heroStudio: true,
    kpis: [['600', 'km/h', 'Maximum speed'], ['250', 'km/h', 'Cruise speed'], ['12', 'km', 'Engagement range'], ['300', 'g', 'Warhead']],
    intro: [
      'SPYS closes the distance to jet-powered targets quickly and intercepts them before they enter the protected area. Motors, warhead and electronic components are of domestic production, built for operation under extreme load.',
      'The platform supports automatic take-off, autonomous navigation to the interception area and AI-assisted terminal guidance. Integration with radar and WIY software reduces time from detection to neutralisation.',
    ],
    capabilities: [
      ['Jet-target speed envelope', 'Up to 600 km/h to engage jet-powered strike drones.'],
      ['AI-assisted terminal guidance', 'Autonomous flight to the interception area, AI-assisted final approach.'],
      ['Thermal or daylight camera', 'Configurations for operation at different times of day.'],
      ['Instant video channel switching', 'Switch video feeds in flight without landing.'],
    ],
    specs: [
      ['Maximum speed', '600 km/h'], ['Cruise speed', '250 km/h'], ['Engagement range', 'up to 12 km'],
      ['Flight time', '5 min'], ['Maximum altitude', 'up to 6 km'], ['Warhead', '300 g'], ['Camera', 'Thermal or daylight'],
    ],
  },
  {
    slug: 'spys-hl', name: 'SPYS HL', domain: 'cuas', role: 'Hand-launched interceptor',
    headline: 'Interception from the operator’s hand',
    tagline: 'A hand-launched variant of SPYS for mobile protection of positions and units without fixed infrastructure.',
    status: 'In development',
    image: 'assets/img/spys-hl.webp',
    hero: 'assets/img/photo/spys-hl-kit.webp', heroStudio: true,
    kpis: [['600', 'km/h', 'Maximum speed'], ['12', 'km', 'Tactical range'], ['50', 'm/s', 'Climb rate'], ['300', 'g', 'Warhead']],
    intro: [
      'SPYS HL is designed for the rapid engagement of jet-powered attack drones. Its compact launch system enables operation without fixed infrastructure.',
      'After launch, the platform autonomously proceeds to the interception area, acquires the target and performs AI-assisted terminal guidance.',
    ],
    capabilities: [
      ['Hand launch', 'No fixed infrastructure — mobile protection for positions and units.'],
      ['AI-assisted terminal guidance', 'Autonomous target acquisition and AI-assisted final approach.'],
    ],
    specs: [
      ['Maximum speed', '600 km/h'], ['Cruise speed', '200–250 km/h'], ['Tactical range', 'up to 12 km'],
      ['Flight time', '4 min'], ['Climb rate', '50 m/s'], ['Maximum altitude', '~6 000 m'], ['Warhead', '300 g'],
    ],
  },

  /* ---------------- ISR ---------------- */
  {
    slug: 'kruk', name: 'KRUK', domain: 'isr', role: 'Tactical ISR',
    headline: 'Tactical reconnaissance for rapid deployment',
    tagline: 'Real-time intelligence with a 28 km flight range, 350 m operating altitude and a digital video link that stays stable in harsh weather.',
    status: 'In service', nsn: true,
    image: 'assets/img/kruk.webp',
    kpis: [['28', 'km', 'Flight range'], ['36', 'min', 'Endurance'], ['350', 'm', 'Operating altitude'], ['2', 'km', 'Vehicle detection']],
    intro: ['Optimised for quick deployment: minimal preparation, maximum mission efficiency. Reliable communications, interference resistance and easy operation shorten decision time.'],
    capabilities: [['Digital video link', 'Stable picture even in harsh weather.'], ['Rapid deployment', 'Minimal preparation before launch.']],
    specs: [['Tactical range', '14 km'], ['Maximum flight range', '28 km'], ['Flight time', '36 min'], ['Operating altitude', '350 m'], ['Vehicle detection & recognition', '2 000 m'], ['Video link', 'Digital']],
  },
  {
    slug: 'kruk-mini', name: 'KRUK MINI', domain: 'isr', role: 'Portable ISR',
    headline: 'Portable reconnaissance for small teams',
    tagline: 'A compact tactical scout that deploys in minutes and provides immediate situational awareness.',
    status: 'In service',
    image: 'assets/img/kruk-mini.webp',
    kpis: [['28', 'km', 'Flight range'], ['36', 'min', 'Endurance'], ['350', 'm', 'Operating altitude'], ['DIG', '', 'Video link']],
    intro: ['Lightweight and simple to use — minimal setup, maximum efficiency.'],
    capabilities: [['Portable', 'Lightweight form factor for small teams.'], ['Digital video link', 'Stable picture in harsh weather.']],
    specs: [['Tactical range', '14 km'], ['Maximum flight range', '28 km'], ['Flight time', '36 min'], ['Operating altitude', '350 m'], ['Video link', 'Digital']],
  },

  /* ---------------- Strike ---------------- */
  {
    slug: 'seemka', name: 'SEEMKA', domain: 'strike', role: '7" FPV strike',
    headline: 'Precision FPV with EW-resilient link',
    tagline: 'Hand-launched 7" FPV with a 4 W FHSS link and 640 thermal camera for strikes up to 14 km.',
    status: 'In service', nsn: true,
    image: 'assets/img/seemka.webp',
    kpis: [['14', 'km', 'Tactical range'], ['14', 'min', 'Flight time'], ['4', 'W', 'FHSS link'], ['1.1', 'kg', 'Payload']],
    intro: ['Acro / Horizon / Angle flight modes for pilots of all levels, in-flight video-frequency switching and day/thermal optics ensure confident target acquisition day or night — even under active EW.'],
    capabilities: [['EW-resilient', '4 W FHSS link with in-flight video-frequency switching.'], ['Day & night', '640 day/thermal camera.']],
    specs: [['Tactical range', '14 km'], ['Flight time with payload', '14 min'], ['Control & telemetry', '770–1000 MHz, FHSS'], ['Maximum payload', '1 100 g'], ['Flight modes', 'Acro, Horizon, Angle'], ['Video link', 'Analog']],
  },
  {
    slug: 'dora', name: 'DORA', domain: 'strike', role: 'Heavy FPV strike',
    headline: 'Heavy FPV for tactical engagements',
    tagline: 'Carries up to 3 kg with a protected FHSS telemetry modem and thermal/day optics.',
    status: 'In service',
    image: 'assets/img/dora.webp',
    kpis: [['3', 'kg', 'Payload'], ['22', 'km', 'Range with payload'], ['25', 'min', 'Endurance'], ['4', 'W', 'FHSS link']],
    intro: ['A 4 W FHSS transmitter with in-flight video-frequency hopping maintains the link under active EW.'],
    capabilities: [['EW-resilient', '4 W FHSS modem with in-flight video hopping.'], ['Day & night', 'Thermal and day optics.']],
    specs: [['Tactical range', '15 km'], ['Maximum range with payload', '22 km'], ['Flight time with payload', '25 min'], ['Maximum payload', '3 000 g'], ['Flight modes', 'Acro, Horizon, Angle'], ['Video link', 'Analog']],
  },
  {
    slug: 'pomsta-x', name: 'POMSTA X', domain: 'strike', role: 'Reusable multi-role',
    headline: 'Drop. Return. Repeat.',
    tagline: 'A reusable strike UAV that delivers effects by dropping a payload and returning to base.',
    status: 'In service', nsn: true,
    image: 'assets/img/pomsta-x.webp',
    kpis: [['3', 'kg', 'Payload'], ['14', 'km', 'Range with payload'], ['24', 'min', 'Endurance'], ['EW', '', 'Resilient']],
    intro: ['Engages personnel, vehicles and fortifications, performs remote mining and delivers special payloads in adverse conditions. Modular design for quick integration.'],
    capabilities: [['Returns to base', 'Drop-and-return profile lowers cost per effect.'], ['EW-resilient', 'Operates under EW on control and telemetry channels.']],
    specs: [['Tactical range', '10 km'], ['Maximum range with payload', '14 km'], ['Flight time with payload', '24 min'], ['Maximum payload', '3 000 g'], ['Video link', 'Digital']],
  },
  {
    slug: 'pomsta-xv', name: 'POMSTA XV', domain: 'strike', role: 'Heavy multi-role',
    headline: 'Heavy lift. Secure links.',
    tagline: 'Up to 10 kg payload with a 4 W FHSS control link and AES-256 encrypted digital video.',
    status: 'In service',
    image: 'assets/img/pomsta-xv.webp',
    kpis: [['10', 'kg', 'Payload'], ['50', 'km', 'Range (1.6 kg)'], ['50', 'min', 'Endurance (1.6 kg)'], ['AES', '256', 'Video encryption']],
    intro: ['Combines high payload capacity and range for precision strikes and special deliveries in harsh conditions.'],
    capabilities: [['Heavy lift', 'Up to 10 kg payload.'], ['Secure links', '4 W FHSS control, AES-256 encrypted digital video.']],
    specs: [['Combat radius, 10 kg', '8 km'], ['Combat radius, 1.6 kg', '25 km'], ['Maximum range, 10 kg', '12 km'], ['Maximum range, 1.6 kg', '50 km'], ['Endurance, 10 kg', '17 min'], ['Endurance, 1.6 kg', '50 min'], ['Video link', 'Digital, AES-256']],
  },

  /* ---------------- GCS & Software ---------------- */
  {
    slug: 'wiy-gcs', name: 'WIY GCS', domain: 'gcs', role: 'Ground control station',
    headline: 'One platform. Total operational control.',
    tagline: 'Purpose-built for interceptor combat operations — developed with operational military units and refined through battlefield experience.',
    status: 'In service',
    image: 'assets/img/photo/gcs-osd.webp', imageCover: true,
    hero: 'assets/img/photo/gcs-osd.webp',
    kpis: [['2', '', 'Monitors'], ['RLS', '', 'Radar integration'], ['OSD', '', 'Real-time cues'], ['1', '', 'Antenna module']],
    intro: [
      'A compact system consisting of an antenna module and a protected control case with two monitors, enabling rapid deployment and operation from a safe standoff distance.',
      'Direct integration with radar systems and WIY software automatically directs interceptors toward the target sector. On-screen OSD prompts display target bearing, altitude and velocity in real time.',
    ],
    capabilities: [
      ['Radar integration', 'Direct integration with radar stations (RLS) for automatic target-sector cueing.'],
      ['Semi-autonomous mode', 'Software guides the interceptor; the operator takes over for terminal engagement.'],
      ['Real-time OSD', 'Bearing, altitude and velocity prompts reduce operator workload.'],
      ['Ruggedised', 'Protected transport case built for mobile combat crews.'],
    ],
    specs: [['Configuration', 'Antenna module + protected control case'], ['Displays', '2 monitors'], ['Integration', 'Radar / RLS, WIY software'], ['Supported interceptors', 'STRILA family, SPYS family']],
  },
];

WIY.bySlug = (s) => WIY.products.find((p) => p.slug === s);
WIY.byDomain = (id) => WIY.products.filter((p) => p.domain === id);

WIY.news = [
  { date: '04 Oct 2026', title: 'German Chancellor Merz announces interceptor-drone package produced by Quantum Systems during Ukraine visit', image: 'assets/img/photo/news-merz.webp', source: 'Quantum Systems' },
  { date: 'Aug 2026', title: 'Quantum WIY Industries: Quantum Systems and WIY Drones form joint venture to scale air-defence interceptors', image: 'assets/img/photo/news-qs-wiy-dusk.webp', source: 'Build with Ukraine' },
  { date: 'Jul 2026', title: 'First batch of 50 SPYS interceptors delivered to the Defence Forces for combat testing', image: 'assets/img/photo/spys-front.webp', source: 'WIY Drones' },
  { date: 'Jul 2026', title: 'Quantum Systems selected as founding member of the EU–Ukraine Drone Alliance', image: 'assets/img/photo/news-eu-ua.webp', source: 'Quantum Systems' },
  { date: 'Mar 2026', title: '15,000 STRILA interceptors for Ukraine’s Security and Defence Forces, financed by Germany', image: 'assets/img/photo/news-strila-snow.webp', source: 'Quantum Systems' },
  { date: 'Mar 2026', title: '“Moving towards an autonomous interceptor”: WIY upgrades STRILA', image: 'assets/img/photo/strila-black.webp', source: 'WIY Drones' },
];
