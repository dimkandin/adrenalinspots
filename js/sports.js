// The ten sections: order, colour (the «All sports» map: its pins, cluster rings and the sport chips) and line icons.
export const SPORTS = ['kite', 'windsurf', 'surf', 'sailing', 'diving', 'snowboard', 'climbing', 'viaferrata', 'paragliding', 'bungee'];
export const SPORT_COLOR = {
  kite: '#1f77b4', windsurf: '#17a2b8', surf: '#1f9d6a', sailing: '#5b6fd6', diving: '#353b94',
  snowboard: '#7d90ad', climbing: '#c8521c', viaferrata: '#8b5a3c', paragliding: '#d99a12', bungee: '#d6589f',
};
// 32×32 line drawings, drawn with stroke (the CSS of each place sets the stroke colour and width)
export const PICK_ICONS = {
  kite: '<path d="M8 15c2-7 9-11 16-10-4 3-6 7-6 12" /><path d="M8 15c3 0 7 1 10 2" /><path d="M8 15l6 12M18 17l-4 10" /><path d="M11 27h6" />',
  surf: '<path d="M4 22c4 0 6-3 8-7s5-7 10-7c3 0 6 2 6 5-3-2-7 0-7 4 0 3 3 5 7 5" /><path d="M4 27c3 0 4-1.5 6-1.5S13 27 16 27s4-1.5 6-1.5 3 1.5 6 1.5" />',
  windsurf: '<path d="M15 4c5 5 8 12 7 19H12z" /><path d="M15 4v19" /><path d="M7 26h20" /><path d="M4 29c3 0 4-1 6-1s3 1 6 1 4-1 6-1 3 1 6 1" />',
  snowboard: '<path d="M3 26l9-14 5 7 4-5 8 12z" /><path d="M9.5 16l2.5 2 2-1.5" /><path d="M21 14l2 3" />',
  climbing: '<rect x="8" y="5" width="12" height="22" rx="6" /><path d="M14 9v14" /><path d="M14 13l4-2" />',
  diving: '<path d="M4 11h20v6a4 4 0 0 1-4 4h-2.5l-2-3h-3l-2 3H8a4 4 0 0 1-4-4z" /><path d="M14 11v4" /><path d="M28 7v13a6 6 0 0 1-6 6h-3" />',
  sailing: '<path d="M15 4v19" /><path d="M15 5c4 4 7 10 7 16h-7z" /><path d="M13 8c-3 4-5 8-6 13h6z" /><path d="M5 23h20l-3 4H8z" />',
  viaferrata: '<path d="M4 28h6v-6h6v-6h6v-6h6" /><path d="M4 20L26 4" /><circle cx="10" cy="15.6" r="1.4" /><circle cx="19" cy="9.1" r="1.4" />',
  bungee: '<path d="M6 5h20" /><path d="M10 5v4M22 5v4" /><path d="M16 5c-3 4 3 6 0 10s3 6 0 8" /><circle cx="16" cy="26" r="2.2" />',
  paragliding: '<path d="M4 11c3-5 21-5 24 0" /><path d="M4 11c4-1.5 20-1.5 24 0" /><path d="M5 11l9 13M27 11l-9 13M12 11l2 13M20 11l-2 13" /><circle cx="16" cy="26" r="2" />',
};

// the «All sports» icon: four squares
PICK_ICONS.all = '<rect x="5" y="5" width="9" height="9" rx="2.5" /><rect x="18" y="5" width="9" height="9" rx="2.5" /><rect x="5" y="18" width="9" height="9" rx="2.5" /><rect x="18" y="18" width="9" height="9" rx="2.5" />';
