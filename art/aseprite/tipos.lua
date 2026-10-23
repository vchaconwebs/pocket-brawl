-- Iconos de los 18 tipos (pixel art, 11 x 11): círculo del color del tipo con su símbolo en blanco.
-- Uso: Aseprite.exe -b --script tipos.lua --script-param dir=<carpeta>
-- Guarda tipos.aseprite (un fotograma... una capa por tipo no hace falta: todos en una tira) y tipos.png
local dir = app.params["dir"] or "."

-- orden: el mismo que PB.TYPE_INFO en data.js
local TYPES = {
  { "normal", "a8a39a", {
    "..xxx..", ".x...x.", "x.....x", "x.....x", "x.....x", ".x...x.", "..xxx.." } },
  { "fire", "ff7a2f", {
    "...x...", "..xx...", "..xxx..", ".xxxx..", ".xxxxx.", ".xx.xx.", "..xxx.." } },
  { "water", "3a9bff", {
    "...x...", "..xxx..", "..xxx..", ".xxxxx.", ".xxxxx.", ".xxxxx.", "..xxx.." } },
  { "grass", "4fc14a", {
    "....xxx", "..xxxxx", ".xxxx.x", ".xxx.xx", ".xx.xxx", ".x.xxx.", "x......" } },
  { "electric", "f5cf2a", {
    "...xxx.", "..xxx..", ".xxx...", ".xxxxx.", "...xxx.", "..xx...", ".x....." } },
  { "ice", "62d2ea", {
    "...x...", ".x.x.x.", "..xxx..", "xxxxxxx", "..xxx..", ".x.x.x.", "...x..." } },
  { "fighting", "d0452c", {
    ".x.x.x.", "xxxxxxx", "xxxxxxx", "xxxxxxx", ".xxxxx.", ".xxxx..", ".xxxx.." } },
  { "poison", "a24bc4", {
    ".xxxxx.", "xxxxxxx", "x..x..x", "xxxxxxx", ".xx.xx.", ".xxxxx.", ".x.x.x." } },
  { "ground", "d8a957", {
    ".......", "...x...", "..xxx..", ".xxxxx.", "xxxxxxx", ".......", "xxxxxxx" } },
  { "flying", "93b2ff", {
    "x......", "xx.....", "xxx....", "xxxxx..", ".xxxxxx", "..xxxxx", "....xx." } },
  { "psychic", "ff4f9a", {
    ".xxxxx.", "x.....x", "x.xxx.x", "x.x.x.x", "x.x...x", "x.xxxxx", "......." } },
  { "bug", "90b82a", {
    "x.....x", ".x...x.", "..xxx..", ".xxxxx.", "xxx.xxx", ".xx.xx.", "..x.x.." } },
  { "rock", "b39a62", {
    "..xxx..", ".xxxxx.", "xxx.xxx", "xx.xxxx", "xxxx.xx", ".xxxxx.", "..xxx.." } },
  { "ghost", "7b5bc4", {
    "..xxx..", ".xxxxx.", "xx.x.xx", "xxxxxxx", "xxxxxxx", "xxxxxxx", "x.x.x.x" } },
  { "dragon", "6a4cff", {
    "x.....x", "xx...xx", ".xx.xx.", ".xxxxx.", "..xxx..", "..xxx..", "...x..." } },
  { "dark", "6e5a50", {
    "..xxx..", ".xx....", "xx.....", "xx.....", "xx.....", ".xx....", "..xxx.." } },
  { "steel", "9aaabb", {
    "..xxx..", ".xxxxx.", "xxx.xxx", "xx...xx", "xxx.xxx", ".xxxxx.", "..xxx.." } },
  { "fairy", "ff8acb", {
    "...x...", "...x...", ".xxxxx.", "xxxxxxx", ".xxxxx.", ".x...x.", "x.....x" } },
}

local S = 11
local function hex(h, k)
  local r, g, b = tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16)
  k = k or 1
  return Color{ r = math.floor(r * k), g = math.floor(g * k), b = math.floor(b * k), a = 255 }
end

local spr = Sprite(S * #TYPES, S, ColorMode.RGB)
local img = spr.cels[1].image
for i, t in ipairs(TYPES) do
  local ox = (i - 1) * S
  local base, dark, light = hex(t[2], 1), hex(t[2], 0.55), hex(t[2], 1.0)
  -- círculo: contorno oscuro y relleno del color del tipo (un poco más claro arriba)
  for y = 0, S - 1 do for x = 0, S - 1 do
    local dx, dy = x - 5, y - 5
    local d = math.sqrt(dx * dx + dy * dy)
    if d <= 5.4 then
      local c = base
      if d > 4.5 then c = dark end
      img:drawPixel(ox + x, y, c)
    end
  end end
  -- símbolo blanco de 7 x 7 en el centro
  for y, row in ipairs(t[3]) do
    for x = 1, #row do
      if row:sub(x, x) == "x" then img:drawPixel(ox + x + 1, y + 1, Color{ r = 255, g = 255, b = 255, a = 255 }) end
    end
  end
end
spr.layers[1].name = "tipos"
spr:saveAs(dir .. "/tipos.aseprite")
spr:saveCopyAs(dir .. "/tipos.png")
spr:close()
print("ok")
