/* The ten readiness areas from the Netravex brochure.
   Shared by the public scorecard (site.js) and the admin portal (admin.js).
   Order matters: the answers array stored in the database follows this order. */
window.NETRAVEX_AREAS = [
  { t: 'Data inventory and classification', h: 'Identify what personal data you collect, where it is stored, who uses it and how it is classified.' },
  { t: 'Notices and consent', h: 'Make sure people are told how their personal data is collected and used, and capture consent where required.' },
  { t: 'Rights requests', h: 'Set up a process for access, correction, erasure and other applicable rights requests.' },
  { t: 'Grievance handling route', h: 'Give people a clear way to raise a complaint and track it to resolution.' },
  { t: 'Data retention and disposal', h: 'Define how long personal data is kept and how it is securely deleted when no longer needed.' },
  { t: 'Access and role management', h: 'Allow only authorised employees to reach the information they need.' },
  { t: 'Logging and monitoring', h: 'Keep activity records and watch access to spot unusual or suspicious activity.' },
  { t: 'Backups and recovery', h: 'Maintain backups and make sure information and services can be restored after a failure.' },
  { t: 'Security controls', h: 'Review safeguards such as encryption, masking, access control and secure data handling.' },
  { t: 'Incident and breach response', h: 'Prepare a process to detect, report, investigate and respond to personal-data breaches.' }
];
