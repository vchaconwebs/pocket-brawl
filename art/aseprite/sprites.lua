-- Sprites de PokéVersus hechos en Aseprite: mandíbulas de Triturar y shurikens de Greninja.
-- Uso: Aseprite.exe -b --script sprites.lua --script-param dir=<carpeta>
-- Guarda un .aseprite por sprite (para editarlo a mano) y su .png a tamaño real (1 píxel = 1 píxel de arte).
local dir = app.params["dir"] or "."

-- Paletas (como las del juego: contorno, oscuro, medio, claro, brillo)
local BONE = { o = Color{ r = 26, g = 16, b = 32 }, d = Color{ r = 90, g = 80, b = 104 }, m = Color{ r = 168, g = 160, b = 184 },
               l = Color{ r = 224, g = 220, b = 232 }, w = Color{ r = 255, g = 255, b = 255 } }
local WATER = { o = Color{ r = 15, g = 47, b = 120 }, d = Color{ r = 31, g = 86, b = 196 }, m = Color{ r = 61, g = 139, b = 255 },
                l = Color{ r = 140, g = 202, b = 255 }, w = Color{ r = 234, g = 247, b = 255 } }

-- rejilla de letras -> sprite
local function grid(w, h) local g = {} for y = 0, h - 1 do g[y] = {} end return g end
local function set(g, w, h, x, y, c) if x >= 0 and y >= 0 and x < w and y < h then g[y][x] = c end end
-- contorno de 1 px alrededor de lo pintado
local function outline(g, w, h)
  local marks = {}
  for y = 0, h - 1 do for x = 0, w - 1 do
    if not g[y][x] then
      for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
        local c = g[y + d[2]] and g[y + d[2]][x + d[1]]
        if c and c ~= "o" then table.insert(marks, { x, y }) break end
      end
    end
  end end
  for _, m in ipairs(marks) do g[m[2]][m[1]] = "o" end
end
local function save(name, g, w, h, pal)
  local spr = Sprite(w, h, ColorMode.RGB)
  local img = spr.cels[1].image
  for y = 0, h - 1 do for x = 0, w - 1 do
    local c = g[y][x]
    if c then img:drawPixel(x, y, pal[c]) end
  end end
  spr.layers[1].name = name
  spr:saveAs(dir .. "/" .. name .. ".aseprite")
  spr:saveCopyAs(dir .. "/" .. name .. ".png")
  spr:close()
end

-- ---------------------------------------------------------------- Triturar
-- Mandíbula de arriba: encía y colmillos de distintos largos (los de los lados, más largos).
local function jaw(lengths, offset, flip)
  local W, H = 36, 16
  local g = grid(W, H)
  local gum = 4
  -- encía: blanca, con la parte de abajo algo más oscura
  for y = 1, gum - 1 do for x = 1, W - 2 do
    local c = "w"
    if y == gum - 1 then c = "l" end
    if y == 1 and x % 7 == 3 then c = "l" end
    set(g, W, H, x, y, c)
  end end
  -- colmillos en punta: 5 px de ancho en la raíz y 1 px en la punta; se separan 1 px (ahí sale el contorno)
  for i, len in ipairs(lengths) do
    local x0 = offset + 1 + (i - 1) * 6
    for r = 0, len - 1 do
      local w = math.max(1, math.floor(5 * (1 - r / len) + 0.5))
      local left = x0 + math.floor((5 - w) / 2)
      for k = 0, w - 1 do
        local c = "w"
        if k == 0 and w > 2 then c = "l" end
        if r >= len - 2 then c = "l" end
        set(g, W, H, left + k, gum + r, c)
      end
    end
  end
  outline(g, W, H)
  if flip then
    local f = grid(W, H)
    for y = 0, H - 1 do f[y] = g[H - 1 - y] end
    return f, W, H
  end
  return g, W, H
end
local top, tw, th = jaw({ 11, 7, 9, 6, 9, 11 }, 0, false)
save("triturar_arriba", top, tw, th, BONE)
local bot, bw, bh = jaw({ 8, 10, 6, 10, 8 }, 3, true)
save("triturar_abajo", bot, bw, bh, BONE)

-- Destello del mordisco: estrella de 8 puntas blanca (como en la animación de la 2ª generación)
do
  local S, c = 25, 12
  local g = grid(S, S)
  for y = 0, S - 1 do for x = 0, S - 1 do
    local dx, dy = x - c, y - c
    local d = math.sqrt(dx * dx + dy * dy)
    local a = math.atan(dy, dx)
    local spike = 6 + 5 * math.abs(math.cos(a * 4)) ^ 6
    if d <= spike then
      local col = "w"
      if d > spike - 1.5 then col = "l" end
      g[y][x] = col
    end
  end end
  outline(g, S, S)
  save("triturar_destello", g, S, S, BONE)
end

-- ---------------------------------------------------------------- Shuriken de Agua
-- Grande (Greninja): el de la referencia, 32 x 32, pasado a la paleta de agua del juego.
do
  local ref = Image{ fromFile = dir .. "/shuriken-32.png" }
  local W, H = ref.width, ref.height
  -- los 10 tonos de la referencia, de más oscuro a más claro, se reparten en los 5 de la paleta
  local tones = {}
  for y = 0, H - 1 do for x = 0, W - 1 do
    local p = ref:getPixel(x, y)
    if app.pixelColor.rgbaA(p) > 0 then
      local lum = app.pixelColor.rgbaR(p) * 0.3 + app.pixelColor.rgbaG(p) * 0.59 + app.pixelColor.rgbaB(p) * 0.11
      tones[p] = lum
    end
  end end
  local list = {}
  for p, lum in pairs(tones) do table.insert(list, { p = p, lum = lum }) end
  table.sort(list, function(a, b) return a.lum < b.lum end)
  local letter = {}
  local L = { "o", "o", "d", "d", "m", "l", "l", "l", "w", "w" }
  for i, t in ipairs(list) do letter[t.p] = L[math.min(#L, math.floor((i - 1) * #L / #list) + 1)] end
  local g = grid(W, H)
  for y = 0, H - 1 do for x = 0, W - 1 do
    local p = ref:getPixel(x, y)
    if app.pixelColor.rgbaA(p) > 0 then g[y][x] = letter[p] end
  end end
  save("shuriken_grande", g, W, H, WATER)
end

-- Pequeño (Froakie): mismo diseño a 15 x 15: cuatro puntas giradas y el agujero del centro
do
  local S, c = 15, 7
  local g = grid(S, S)
  local function arm(rot)
    for d = 1, 7 do
      local half = math.floor(2.4 * (1 - d / 8) + 0.5)
      local tw = math.floor(d * 0.3 + 0.5) -- giro (como un molinillo)
      for s = -half, half do
        local x, y = tw + s, -d
        for _ = 1, rot do x, y = -y, x end
        local col = "m"
        if s < 0 then col = "l" end
        if d >= 6 then col = "l" end
        if s == 0 and d > 2 and d < 6 then col = "w" end
        set(g, S, S, c + x, c + y, col)
      end
    end
  end
  for r = 0, 3 do arm(r) end
  for y = -1, 1 do for x = -1, 1 do set(g, S, S, c + x, c + y, "d") end end
  g[c][c] = nil -- agujero
  outline(g, S, S)
  save("shuriken_pequeno", g, S, S, WATER)
end

-- ---------------------------------------------------------------- Puños Plasma (Zeraora)
-- Puño visto de frente (como el de Puño Trueno de la 4ª generación): cuatro dedos con los nudillos arriba,
-- la palma debajo y el pulgar cruzando por delante. Amarillo eléctrico.
local GOLD = { o = Color{ r = 74, g = 48, b = 0 }, d = Color{ r = 160, g = 112, b = 0 }, m = Color{ r = 255, g = 200, b = 26 },
               l = Color{ r = 255, g = 240, b = 122 }, w = Color{ r = 255, g = 255, b = 255 } }
do
  local W, H = 20, 18
  local g = grid(W, H)
  -- dedos (4 x 8), redondeados arriba; entre dedo y dedo, una raya oscura
  for i = 0, 3 do
    local x0 = 2 + i * 4
    for y = 1, 9 do
      for x = x0, x0 + 3 do
        local top = (y == 1 and (x == x0 or x == x0 + 3))
        if not top then
          local c = "m"
          if x == x0 + 1 and y >= 2 and y <= 5 then c = "l" end
          if x == x0 + 1 and y == 2 then c = "w" end
          if x == x0 + 3 and y >= 3 then c = "d" end
          set(g, W, H, x, y, c)
        end
      end
    end
  end
  -- palma
  for y = 9, 15 do for x = 2, 17 do
    local c = "m"
    if y == 9 then c = "l" end
    if y == 15 or x == 17 then c = "d" end
    set(g, W, H, x, y, c)
  end end
  -- pulgar cruzando por delante, con su propio contorno
  for y = 10, 14 do for x = 1, 11 do
    local c = "l"
    if y == 10 and x > 1 and x < 11 then c = "w" end
    if y == 14 then c = "d" end
    if x == 1 or x == 11 or y == 10 and (x == 1 or x == 11) then c = "o" end
    set(g, W, H, x, y, c)
  end end
  for x = 2, 10 do set(g, W, H, x, 9, "o") end
  -- esquinas redondeadas: palma, pulgar y nudillos
  for _, p in ipairs({ { 2, 15 }, { 17, 15 }, { 17, 14 }, { 1, 10 }, { 1, 14 }, { 2, 2 }, { 17, 2 } }) do g[p[2]][p[1]] = nil end
  for i = 0, 3 do set(g, W, H, 2 + i * 4 + 2, 2, "l") end
  outline(g, W, H)
  save("puno_trueno", g, W, H, GOLD)
end

print("ok")
