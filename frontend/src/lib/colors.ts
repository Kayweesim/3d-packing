export const BOX_COLORS: string[] = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#ff5722', // deep orange
  '#8bc34a', // light green
  '#673ab7', // deep purple
  '#03a9f4', // light blue
  '#ffeb3b', // yellow
  '#ff4081', // pink accent
  '#26c6da', // cyan light
  '#ef5350', // red light
]

export function getBoxColor(colorIndex: number): string {
  return BOX_COLORS[colorIndex % BOX_COLORS.length]
}
