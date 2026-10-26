const paths = {
  chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  history: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M6 18 18 6',
  send: 'M12 19V5m-6 6 6-6 6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6a8 8 0 0 1 13.1 2M4.8 16a8 8 0 0 0 13.1 2',
};
export function AssistantIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
