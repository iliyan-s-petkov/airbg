// Whether the bottom panel over the map is open: the sensor chart draws its panel copy only then.
let on = $state(false)

export const panelDock = {
  get on() { return on },
  set on(next) { on = next },
}
