'use strict';

var MUSIC_PLANET_POOL_LIMIT = 96;
var musicPlanetState = {
  open: false,
  previousFocus: null,
  songs: [],
  artists: [],
  currentSong: null,
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  halo: null,
  canvas: null,
  pickables: [],
  artistMeshes: [],
  satelliteGroups: [],
  textures: [],
  raf: 0,
  buildId: 0,
  drag: null,
  hoverNode: null,
  selectedArtistKey: '',
  keyboardIndex: 0,
  zoom: 10.8,
  reducedMotion: false,
  resizeObserver: null,
  controlsBound: false,
};

function musicPlanetNormalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·•・]/g, '')
    .trim();
}

function musicPlanetArtistName(song) {
  song = song || {};
  var value = song.artist || song.singer || song.artistName || song.author || song.albumArtist || '';
  if (!value && Array.isArray(song.artists)) {
    value = song.artists.map(function (artist) { return artist && (artist.name || artist.artistName || artist); }).filter(Boolean).join(' / ');
  }
  if (Array.isArray(value)) value = value.map(function (artist) { return artist && (artist.name || artist); }).filter(Boolean).join(' / ');
  value = String(value || '').split(/\s*(?:\/|、|,|&| feat\.? | ft\.? )\s*/i)[0].trim();
  return value || '未知歌手';
}

function musicPlanetSongIdentity(song) {
  song = song || {};
  var provider = String(song.provider || song.source || song.type || 'song').toLowerCase();
  var id = song.id || song.songId || song.songmid || song.mid || song.hash || song.localKey || song.path || '';
  if (id) return provider + ':' + String(id);
  return musicPlanetNormalizeText(song.name || song.title) + '|' + musicPlanetNormalizeText(musicPlanetArtistName(song));
}

function musicPlanetEquivalentIdentity(song) {
  song = song || {};
  return musicPlanetNormalizeText(song.name || song.title) + '|' + musicPlanetNormalizeText(musicPlanetArtistName(song));
}

function musicPlanetUniqueSongs(songs, limit) {
  var providerSeen = {};
  var equivalentSeen = {};
  var result = [];
  (Array.isArray(songs) ? songs : []).some(function (song) {
    if (!song || !(song.name || song.title)) return false;
    if (song.type === 'podcast' || song.type === 'podcast-radio' || song.programId || song.radioId) return false;
    var providerKey = musicPlanetSongIdentity(song);
    var equivalentKey = musicPlanetEquivalentIdentity(song);
    if (!equivalentKey || providerSeen[providerKey] || equivalentSeen[equivalentKey]) return false;
    providerSeen[providerKey] = true;
    equivalentSeen[equivalentKey] = true;
    result.push(song);
    return result.length >= (Number(limit) || MUSIC_PLANET_POOL_LIMIT);
  });
  return result;
}

function musicPlanetCollectSongPool() {
  var pool = [];
  function append(list) {
    if (Array.isArray(list)) list.forEach(function (song) { if (song) pool.push(song); });
  }
  var current = typeof playQueue !== 'undefined' && typeof currentIdx !== 'undefined' && currentIdx >= 0
    ? playQueue[currentIdx]
    : null;
  if (current) pool.push(current);
  if (typeof playQueue !== 'undefined') append(playQueue);
  if (typeof playlist !== 'undefined') append(playlist);
  if (typeof persistentLocalLibraryTracks !== 'undefined') append(persistentLocalLibraryTracks);
  if (typeof localLibraryPlaybackSongs === 'function') {
    try { append(localLibraryPlaybackSongs()); } catch (_error) { }
  }
  if (typeof homeDiscoverState !== 'undefined' && homeDiscoverState) append(homeDiscoverState.songs);
  if (typeof homePlatformRankingState !== 'undefined' && homePlatformRankingState) append(homePlatformRankingState.songs);
  if (typeof userPlaylists !== 'undefined' && Array.isArray(userPlaylists)) {
    userPlaylists.forEach(function (item) { append(item && item.songs); });
  }
  if (typeof localFilePlaylists !== 'undefined' && Array.isArray(localFilePlaylists)) {
    localFilePlaylists.forEach(function (item) { append(item && item.songs); });
  }
  return musicPlanetUniqueSongs(pool, MUSIC_PLANET_POOL_LIMIT);
}

function musicPlanetLayoutCaps(width, lowPower) {
  var compact = Number(width) <= 620 || lowPower === true;
  return compact
    ? { artists: 8, tracksPerArtist: 3, tracks: 24 }
    : { artists: 12, tracksPerArtist: 4, tracks: 48 };
}

function musicPlanetGroupSongs(songs, currentSong, caps) {
  caps = caps || musicPlanetLayoutCaps(1280, false);
  var buckets = {};
  musicPlanetUniqueSongs(songs, MUSIC_PLANET_POOL_LIMIT).forEach(function (song) {
    var name = musicPlanetArtistName(song);
    var key = musicPlanetNormalizeText(name) || 'unknown';
    if (!buckets[key]) buckets[key] = { key: key, name: name, songs: [] };
    buckets[key].songs.push(song);
  });
  var artists = Object.keys(buckets).map(function (key) { return buckets[key]; });
  artists.sort(function (a, b) {
    if (a.songs.length !== b.songs.length) return b.songs.length - a.songs.length;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  var currentKey = currentSong ? musicPlanetNormalizeText(musicPlanetArtistName(currentSong)) : '';
  if (currentKey) {
    var currentArtistIndex = artists.findIndex(function (artist) { return artist.key === currentKey; });
    if (currentArtistIndex > 0) artists.unshift(artists.splice(currentArtistIndex, 1)[0]);
  }
  artists = artists.slice(0, Math.max(1, Number(caps.artists) || 12));
  var remaining = Math.max(1, Number(caps.tracks) || 48);
  artists.forEach(function (artist) {
    var take = Math.min(remaining, Math.max(1, Number(caps.tracksPerArtist) || 4), artist.songs.length);
    artist.songs = artist.songs.slice(0, take);
    remaining -= take;
  });
  artists = artists.filter(function (artist) { return artist.songs.length; });
  return {
    artists: artists,
    songs: artists.reduce(function (result, artist) { return result.concat(artist.songs); }, []),
    currentSong: currentSong || (artists[0] && artists[0].songs[0]) || null,
    currentArtistKey: currentKey,
  };
}

function musicPlanetHash(value) {
  var hash = 2166136261;
  String(value || '').split('').forEach(function (character) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return hash >>> 0;
}

function musicPlanetColor(value, lightness) {
  var hue = musicPlanetHash(value) % 360;
  return 'hsl(' + hue + ', 58%, ' + (Number(lightness) || 58) + '%)';
}

function musicPlanetSongCover(song, size) {
  if (!song) return '';
  try {
    if (typeof songCoverSrc === 'function') return songCoverSrc(song, size || 160) || '';
  } catch (_error) { }
  return song.cover || song.picUrl || song.img || '';
}

function musicPlanetEscape(value) {
  return typeof escHtml === 'function'
    ? escHtml(String(value || ''))
    : String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
}

function musicPlanetPlayIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/></svg>';
}

function musicPlanetNextIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5v9l7-4.5-7-4.5Zm9.5-1v11M19 8v8M15 12h8"/></svg>';
}

function musicPlanetCollectIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v14H5zM8 9h8M8 13h6M9 3h6"/></svg>';
}

function musicPlanetSetSummary(message) {
  var summary = document.getElementById('music-planet-summary');
  if (summary) summary.textContent = message || '';
}

function musicPlanetSetCounts(grouped) {
  var artists = grouped && grouped.artists || [];
  var songs = grouped && grouped.songs || [];
  var label = artists.length + ' 位歌手 · ' + songs.length + ' 首歌曲';
  var counts = document.getElementById('music-planet-counts');
  if (counts) counts.textContent = label;
  musicPlanetSetSummary(songs.length ? ('从现有曲库连接出 ' + label) : '当前还没有可绘制的歌曲');
}

function musicPlanetFallbackHtml(grouped, failed) {
  var artists = grouped && grouped.artists || [];
  if (!artists.length) {
    return '<div class="music-planet-fallback-empty"><strong>星图还没有亮起来</strong><span>先播放、导入或载入一些音乐，再回来看看。</span></div>';
  }
  return '<div class="music-planet-fallback-artists"' + (failed ? ' data-webgl-fallback="true"' : '') + '>' + artists.map(function (artist, index) {
    return '<button class="music-planet-fallback-artist" type="button" data-music-planet-artist="' + index + '">' +
      '<span>' + musicPlanetEscape(artist.name) + '</span><small>' + artist.songs.length + ' 首</small></button>';
  }).join('') + '</div>';
}

function musicPlanetShowFallback(grouped, failed) {
  var fallback = document.getElementById('music-planet-fallback');
  var canvas = document.getElementById('music-planet-canvas');
  if (!fallback) return;
  fallback.innerHTML = musicPlanetFallbackHtml(grouped, failed);
  fallback.hidden = false;
  if (canvas) canvas.hidden = true;
}

function musicPlanetHideFallback() {
  var fallback = document.getElementById('music-planet-fallback');
  var canvas = document.getElementById('music-planet-canvas');
  if (fallback) fallback.hidden = true;
  if (canvas) canvas.hidden = false;
}

function musicPlanetDisposeScene() {
  musicPlanetState.buildId += 1;
  if (musicPlanetState.scene) {
    var disposedGeometry = [];
    var disposedMaterial = [];
    musicPlanetState.scene.traverse(function (object) {
      if (object.geometry && disposedGeometry.indexOf(object.geometry) < 0) {
        disposedGeometry.push(object.geometry);
        if (typeof object.geometry.dispose === 'function') object.geometry.dispose();
      }
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(function (material) {
        if (!material || disposedMaterial.indexOf(material) >= 0) return;
        disposedMaterial.push(material);
        if (material.map && typeof material.map.dispose === 'function') material.map.dispose();
        if (typeof material.dispose === 'function') material.dispose();
      });
    });
  }
  musicPlanetState.textures.forEach(function (texture) {
    try { if (texture && typeof texture.dispose === 'function') texture.dispose(); } catch (_error) { }
  });
  musicPlanetState.textures = [];
  musicPlanetState.scene = null;
  musicPlanetState.camera = null;
  musicPlanetState.root = null;
  musicPlanetState.halo = null;
  musicPlanetState.pickables = [];
  musicPlanetState.artistMeshes = [];
  musicPlanetState.satelliteGroups = [];
}

function musicPlanetSeededUnit(index, salt) {
  var value = musicPlanetHash(String(index) + '|' + String(salt));
  return (value % 100000) / 100000;
}

function musicPlanetAddStars(scene, compact) {
  var count = compact ? 260 : 520;
  var positions = new Float32Array(count * 3);
  var colors = new Float32Array(count * 3);
  for (var index = 0; index < count; index += 1) {
    var radius = 6 + musicPlanetSeededUnit(index, 'r') * 19;
    var theta = musicPlanetSeededUnit(index, 't') * Math.PI * 2;
    var phi = Math.acos(2 * musicPlanetSeededUnit(index, 'p') - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    var value = .52 + musicPlanetSeededUnit(index, 'c') * .48;
    colors[index * 3] = value * .78;
    colors[index * 3 + 1] = value * .88;
    colors[index * 3 + 2] = value;
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  var material = new THREE.PointsMaterial({
    size: compact ? .045 : .036,
    vertexColors: true,
    transparent: true,
    opacity: .78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geometry, material));
}

function musicPlanetAddOrbit(root, radius, y, color) {
  var points = [];
  for (var index = 0; index < 96; index += 1) {
    var angle = index / 96 * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  var geometry = new THREE.BufferGeometry().setFromPoints(points);
  var material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: .11, depthWrite: false });
  root.add(new THREE.LineLoop(geometry, material));
}

function musicPlanetFallbackTexture(label, color) {
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  var canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  var context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, 96, 96);
  context.beginPath();
  context.arc(48, 48, 43, 0, Math.PI * 2);
  context.fillStyle = color || '#6fb9c4';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(255,255,255,.62)';
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,.92)';
  context.font = '700 34px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(label || '?').trim().slice(0, 1).toUpperCase() || '?', 48, 50);
  var texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  musicPlanetState.textures.push(texture);
  return texture;
}

function musicPlanetApplyCover(material, cover, buildId, fallbackLabel, fallbackColor) {
  if (!material || typeof THREE === 'undefined') return;
  var fallbackTexture = musicPlanetFallbackTexture(fallbackLabel, fallbackColor);
  if (fallbackTexture) {
    material.map = fallbackTexture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }
  if (!cover || !THREE.TextureLoader) return;
  var loader = new THREE.TextureLoader();
  if (typeof loader.setCrossOrigin === 'function') loader.setCrossOrigin('anonymous');
  loader.load(cover, function (texture) {
    if (buildId !== musicPlanetState.buildId || !material) {
      if (texture && typeof texture.dispose === 'function') texture.dispose();
      return;
    }
    if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
    musicPlanetState.textures.push(texture);
  }, undefined, function () { });
}

function musicPlanetBuildScene(grouped) {
  musicPlanetDisposeScene();
  var canvas = document.getElementById('music-planet-canvas');
  if (!canvas || typeof THREE === 'undefined' || !THREE.WebGLRenderer) return false;
  musicPlanetState.canvas = canvas;
  try {
    if (!musicPlanetState.renderer) {
      musicPlanetState.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      musicPlanetState.renderer.setClearColor(0x030508, 1);
    }
    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030508, .035);
    var camera = new THREE.PerspectiveCamera(48, 1, .1, 60);
    var root = new THREE.Group();
    root.rotation.x = -.34;
    scene.add(root);
    musicPlanetState.scene = scene;
    musicPlanetState.camera = camera;
    musicPlanetState.root = root;
    musicPlanetState.zoom = window.innerWidth <= 620 ? 11.6 : 9.6;
    camera.position.set(0, .15, musicPlanetState.zoom);
    camera.lookAt(0, 0, 0);
    musicPlanetAddStars(scene, window.innerWidth <= 620);
    scene.add(new THREE.AmbientLight(0xb7d5e8, .68));
    var keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(-4, 6, 8);
    scene.add(keyLight);
    var edgeLight = new THREE.PointLight(0x77d8d0, .8, 20);
    edgeLight.position.set(4, -2, 5);
    scene.add(edgeLight);

    var buildId = musicPlanetState.buildId;
    var current = grouped.currentSong;
    if (current) {
      var currentGroup = new THREE.Group();
      var currentColor = musicPlanetColor(musicPlanetArtistName(current), 62);
      var currentMaterial = new THREE.SpriteMaterial({ color: new THREE.Color(currentColor), transparent: true, opacity: 1 });
      var currentSprite = new THREE.Sprite(currentMaterial);
      currentSprite.scale.set(1.15, 1.15, 1);
      currentSprite.userData.musicPlanetNode = { type: 'song', song: current, label: current.name || current.title || '当前歌曲' };
      currentGroup.add(currentSprite);
      var currentRing = new THREE.Mesh(
        new THREE.TorusGeometry(.72, .024, 10, 64),
        new THREE.MeshBasicMaterial({ color: 0xbffcf7, transparent: true, opacity: .66, depthWrite: false })
      );
      currentGroup.add(currentRing);
      root.add(currentGroup);
      musicPlanetState.pickables.push(currentSprite);
      musicPlanetApplyCover(currentMaterial, musicPlanetSongCover(current, 220), buildId, current.name || current.title, currentColor);
    }

    var connectorPositions = [];
    grouped.artists.forEach(function (artist, artistIndex) {
      var angle = artistIndex / Math.max(1, grouped.artists.length) * Math.PI * 2;
      var radius = 2.35 + (artistIndex % 3) * .78;
      var y = ((artistIndex % 5) - 2) * .34;
      var zScale = .72;
      var x = Math.cos(angle) * radius;
      var z = Math.sin(angle) * radius * zScale;
      var group = new THREE.Group();
      group.position.set(x, y, z);
      group.userData.musicPlanetArtist = artist;
      root.add(group);
      connectorPositions.push(0, 0, 0, x, y, z);
      musicPlanetAddOrbit(root, radius, y, 0x89a5b6);

      var color = musicPlanetColor(artist.name, 60);
      var sphere = new THREE.Mesh(
        new THREE.SphereGeometry(.28 + Math.min(.18, artist.songs.length * .028), 20, 14),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          roughness: .72,
          metalness: .06,
          emissive: new THREE.Color(color),
          emissiveIntensity: .12,
        })
      );
      sphere.userData.musicPlanetNode = { type: 'artist', artist: artist, artistIndex: artistIndex, label: artist.name };
      group.add(sphere);
      musicPlanetState.pickables.push(sphere);
      musicPlanetState.artistMeshes.push({ key: artist.key, group: group, mesh: sphere });

      var satelliteGroup = new THREE.Group();
      group.add(satelliteGroup);
      musicPlanetState.satelliteGroups.push(satelliteGroup);
      var satelliteSongs = artist.songs.filter(function (song) {
        return !current || musicPlanetEquivalentIdentity(song) !== musicPlanetEquivalentIdentity(current);
      });
      satelliteSongs.forEach(function (song, songIndex) {
        var satelliteAngle = songIndex / Math.max(1, artist.songs.length) * Math.PI * 2 + artistIndex * .29;
        var satelliteRadius = .72 + songIndex * .12;
        var material = new THREE.SpriteMaterial({ color: new THREE.Color(color), transparent: true, opacity: .94 });
        var sprite = new THREE.Sprite(material);
        sprite.position.set(
          Math.cos(satelliteAngle) * satelliteRadius,
          Math.sin(satelliteAngle) * satelliteRadius * .55,
          Math.sin(satelliteAngle * 1.7) * .25
        );
        var scale = songIndex === 0 ? .36 : .29;
        sprite.scale.set(scale, scale, 1);
        sprite.userData.musicPlanetNode = {
          type: 'song',
          song: song,
          artist: artist,
          label: song.name || song.title || '未知歌曲',
        };
        satelliteGroup.add(sprite);
        musicPlanetState.pickables.push(sprite);
        musicPlanetApplyCover(material, musicPlanetSongCover(song, 120), buildId, song.name || song.title, color);
      });
    });

    if (connectorPositions.length) {
      var connectorGeometry = new THREE.BufferGeometry();
      connectorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(connectorPositions, 3));
      var connectors = new THREE.LineSegments(
        connectorGeometry,
        new THREE.LineBasicMaterial({ color: 0x7893a4, transparent: true, opacity: .13, depthWrite: false })
      );
      root.add(connectors);
    }

    musicPlanetState.halo = new THREE.Mesh(
      new THREE.TorusGeometry(.52, .018, 8, 56),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, depthWrite: false })
    );
    musicPlanetState.halo.visible = false;
    root.add(musicPlanetState.halo);
    musicPlanetResize();
    return true;
  } catch (error) {
    console.warn('[MusicPlanet] WebGL init failed', error);
    musicPlanetDisposeScene();
    return false;
  }
}

function musicPlanetResize() {
  var canvas = musicPlanetState.canvas;
  var renderer = musicPlanetState.renderer;
  var camera = musicPlanetState.camera;
  if (!canvas || !renderer || !camera) return;
  var rect = canvas.getBoundingClientRect();
  var width = Math.max(1, Math.round(rect.width));
  var height = Math.max(1, Math.round(rect.height));
  var lowPower = typeof runtimeHardwareProfile !== 'undefined' && runtimeHardwareProfile && runtimeHardwareProfile.lowSpec;
  var dpr = Math.min(lowPower ? 1 : 1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function musicPlanetStartFrame() {
  if (musicPlanetState.raf || !musicPlanetState.open || document.hidden || !musicPlanetState.renderer || !musicPlanetState.scene) return;
  musicPlanetState.raf = requestAnimationFrame(musicPlanetFrame);
}

function musicPlanetStopFrame() {
  if (musicPlanetState.raf) cancelAnimationFrame(musicPlanetState.raf);
  musicPlanetState.raf = 0;
}

function musicPlanetFrame() {
  musicPlanetState.raf = 0;
  if (!musicPlanetState.open || document.hidden || !musicPlanetState.renderer || !musicPlanetState.scene || !musicPlanetState.camera) return;
  if (!musicPlanetState.reducedMotion && !musicPlanetState.drag && musicPlanetState.root) musicPlanetState.root.rotation.y += .0014;
  musicPlanetState.satelliteGroups.forEach(function (group, index) {
    if (!musicPlanetState.reducedMotion) group.rotation.z += .001 + index * .00005;
  });
  if (musicPlanetState.halo && musicPlanetState.halo.visible) musicPlanetState.halo.rotation.z += .006;
  musicPlanetState.renderer.render(musicPlanetState.scene, musicPlanetState.camera);
  musicPlanetState.raf = requestAnimationFrame(musicPlanetFrame);
}

function musicPlanetPointerNode(event) {
  if (!musicPlanetState.canvas || !musicPlanetState.camera || !musicPlanetState.pickables.length || typeof THREE === 'undefined') return null;
  var rect = musicPlanetState.canvas.getBoundingClientRect();
  var x = (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1;
  var y = -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1);
  var raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), musicPlanetState.camera);
  var hits = raycaster.intersectObjects(musicPlanetState.pickables, false);
  return hits.length ? hits[0].object.userData.musicPlanetNode || null : null;
}

function musicPlanetShowNodeLabel(node, event) {
  var label = document.getElementById('music-planet-node-label');
  var stage = document.querySelector('.music-planet-stage');
  if (!label || !stage) return;
  if (!node) {
    label.classList.remove('show');
    label.textContent = '';
    return;
  }
  var rect = stage.getBoundingClientRect();
  label.textContent = node.type === 'artist'
    ? node.artist.name + ' · ' + node.artist.songs.length + ' 首'
    : (node.label + ' · ' + musicPlanetArtistName(node.song));
  label.style.left = Math.max(16, Math.min(rect.width - 16, event.clientX - rect.left)) + 'px';
  label.style.top = Math.max(24, Math.min(rect.height - 24, event.clientY - rect.top)) + 'px';
  label.classList.add('show');
}

function musicPlanetSelectArtistMesh(key) {
  var match = null;
  musicPlanetState.artistMeshes.forEach(function (entry) {
    var selected = entry.key === key;
    if (entry.mesh && entry.mesh.material) entry.mesh.material.emissiveIntensity = selected ? .42 : .12;
    if (selected) match = entry;
  });
  if (musicPlanetState.halo) {
    musicPlanetState.halo.visible = !!match;
    if (match) musicPlanetState.halo.position.copy(match.group.position);
  }
}

function musicPlanetRowHtml(song, index, artist) {
  var cover = musicPlanetSongCover(song, 100);
  var coverStyle = cover
    ? ' style="--music-planet-cover:url(\'' + musicPlanetEscape(cover) + '\')"'
    : ' style="--music-planet-cover:' + musicPlanetColor(artist.name + index, 34) + '"';
  var album = song.album || song.albumName || song.source || song.provider || '';
  return '<div class="music-planet-row" role="listitem" data-music-planet-song="' + index + '">' +
    '<button class="music-planet-row-main" type="button" data-music-planet-action="play" data-music-planet-song="' + index + '" aria-label="播放 ' + musicPlanetEscape(song.name || song.title || '歌曲') + '">' +
    '<span class="music-planet-row-cover"' + coverStyle + '></span>' +
    '<span class="music-planet-row-copy"><strong>' + musicPlanetEscape(song.name || song.title || '未知歌曲') + '</strong><small>' + musicPlanetEscape(album || musicPlanetArtistName(song)) + '</small></span></button>' +
    '<span class="music-planet-row-actions">' +
    '<button class="music-planet-row-action" type="button" data-music-planet-action="next" data-music-planet-song="' + index + '" title="下一首播放" aria-label="下一首播放">' + musicPlanetNextIcon() + '</button>' +
    '<button class="music-planet-row-action" type="button" data-music-planet-action="collect" data-music-planet-song="' + index + '" title="收藏到歌单" aria-label="收藏到歌单">' + musicPlanetCollectIcon() + '</button></span></div>';
}

function openMusicPlanetArtist(artistOrIndex) {
  var artist = typeof artistOrIndex === 'number'
    ? musicPlanetState.artists[artistOrIndex]
    : artistOrIndex;
  if (!artist) return false;
  var drawer = document.getElementById('music-planet-drawer');
  var name = document.getElementById('music-planet-drawer-name');
  var meta = document.getElementById('music-planet-drawer-meta');
  var orb = document.getElementById('music-planet-drawer-orb');
  var list = document.getElementById('music-planet-drawer-list');
  var selection = document.getElementById('music-planet-selection');
  if (!drawer || !list) return false;
  musicPlanetState.selectedArtistKey = artist.key;
  musicPlanetState.keyboardIndex = Math.max(0, musicPlanetState.artists.indexOf(artist));
  if (name) name.textContent = artist.name;
  if (meta) meta.textContent = artist.songs.length + ' 首关联歌曲';
  if (orb) orb.style.setProperty('--music-planet-orb', musicPlanetColor(artist.name, 58));
  if (selection) selection.textContent = artist.name + ' · ' + artist.songs.length + ' 首歌曲';
  list.innerHTML = artist.songs.map(function (song, index) { return musicPlanetRowHtml(song, index, artist); }).join('');
  drawer.classList.add('show');
  drawer.setAttribute('aria-hidden', 'false');
  musicPlanetSelectArtistMesh(artist.key);
  return true;
}

function closeMusicPlanetDrawer() {
  var drawer = document.getElementById('music-planet-drawer');
  var selection = document.getElementById('music-planet-selection');
  if (drawer) {
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
  }
  musicPlanetState.selectedArtistKey = '';
  musicPlanetSelectArtistMesh('');
  if (selection) selection.textContent = '选择一颗歌手星球查看歌曲';
}

function musicPlanetSelectedSong(index) {
  var artist = musicPlanetState.artists.find(function (entry) { return entry.key === musicPlanetState.selectedArtistKey; });
  return artist && artist.songs[Number(index)] || null;
}

function musicPlanetQueueIndex(song) {
  if (!song || typeof playQueue === 'undefined') return -1;
  var identity = musicPlanetSongIdentity(song);
  for (var index = 0; index < playQueue.length; index += 1) {
    if (musicPlanetSongIdentity(playQueue[index]) === identity || musicPlanetEquivalentIdentity(playQueue[index]) === musicPlanetEquivalentIdentity(song)) return index;
  }
  if (typeof queueSong === 'function') return queueSong(song);
  return -1;
}

function playMusicPlanetSong(song) {
  if (!song) return false;
  var index = musicPlanetQueueIndex(song);
  if (index < 0 || typeof playQueueAt !== 'function') return false;
  currentIdx = index;
  Promise.resolve(playQueueAt(index, {
    manual: true,
    context: { type: 'music-planet', playlistName: '音乐星图' },
  })).then(function (started) {
    if (started === false) {
      if (typeof showToast === 'function') showToast('这首歌暂时无法播放');
      return;
    }
    closeMusicPlanet();
  }).catch(function (error) {
    console.warn('[MusicPlanetPlay]', error);
    if (typeof showToast === 'function') showToast('这首歌暂时无法播放');
  });
  return true;
}

function queueMusicPlanetSongNext(song) {
  if (!song || typeof queueSongNext !== 'function') return false;
  queueSongNext(song);
  if (typeof showToast === 'function') showToast('已设为下一首: ' + (song.name || song.title || '当前歌曲'));
  return true;
}

function collectMusicPlanetSong(song) {
  if (!song || typeof openCollectModal !== 'function') return false;
  closeMusicPlanet();
  setTimeout(function () { openCollectModal(song); }, 240);
  return true;
}

function musicPlanetHandleSongAction(action, index) {
  var song = musicPlanetSelectedSong(index);
  if (!song) return;
  if (action === 'play') playMusicPlanetSong(song);
  else if (action === 'next') queueMusicPlanetSongNext(song);
  else if (action === 'collect') collectMusicPlanetSong(song);
}

function resetMusicPlanetView() {
  musicPlanetState.zoom = window.innerWidth <= 620 ? 11.6 : 9.6;
  if (musicPlanetState.camera) {
    musicPlanetState.camera.position.set(0, .15, musicPlanetState.zoom);
    musicPlanetState.camera.lookAt(0, 0, 0);
  }
  if (musicPlanetState.root) musicPlanetState.root.rotation.set(-.34, 0, 0);
  closeMusicPlanetDrawer();
}

function musicPlanetBuild() {
  var width = window.innerWidth || 1280;
  var lowPower = typeof runtimeHardwareProfile !== 'undefined' && runtimeHardwareProfile && runtimeHardwareProfile.lowSpec;
  var songs = musicPlanetCollectSongPool();
  var current = typeof playQueue !== 'undefined' && typeof currentIdx !== 'undefined' && currentIdx >= 0 ? playQueue[currentIdx] : songs[0] || null;
  var grouped = musicPlanetGroupSongs(songs, current, musicPlanetLayoutCaps(width, !!lowPower));
  musicPlanetState.songs = grouped.songs;
  musicPlanetState.artists = grouped.artists;
  musicPlanetState.currentSong = grouped.currentSong;
  musicPlanetSetCounts(grouped);
  closeMusicPlanetDrawer();
  if (!grouped.songs.length) {
    musicPlanetDisposeScene();
    musicPlanetShowFallback(grouped, false);
    return;
  }
  if (!musicPlanetBuildScene(grouped)) {
    musicPlanetShowFallback(grouped, true);
    musicPlanetSetSummary('3D 渲染不可用，已切换为歌曲列表');
    return;
  }
  musicPlanetHideFallback();
  musicPlanetStartFrame();
}

function musicPlanetOpenSurface() {
  var mask = document.getElementById('music-planet-mask');
  if (!mask) return;
  musicPlanetState.open = true;
  mask.setAttribute('aria-hidden', 'false');
  if (typeof openGsapModal === 'function') openGsapModal(mask);
  else mask.classList.add('show');
  setTimeout(function () {
    musicPlanetBuild();
    var canvas = document.getElementById('music-planet-canvas');
    if (canvas && !canvas.hidden) canvas.focus();
  }, 60);
}

function openMusicPlanet() {
  musicPlanetState.previousFocus = document.activeElement;
  var discoveryOpen = typeof homePlatformRecommendationState !== 'undefined' && homePlatformRecommendationState.open;
  if (discoveryOpen && typeof closeHomePlatformRecommendations === 'function') {
    closeHomePlatformRecommendations();
    setTimeout(musicPlanetOpenSurface, 70);
  } else {
    musicPlanetOpenSurface();
  }
}

function closeMusicPlanet() {
  if (!musicPlanetState.open) return;
  var mask = document.getElementById('music-planet-mask');
  musicPlanetState.open = false;
  musicPlanetStopFrame();
  closeMusicPlanetDrawer();
  var label = document.getElementById('music-planet-node-label');
  if (label) label.classList.remove('show');
  if (mask) mask.setAttribute('aria-hidden', 'true');
  var focusTarget = musicPlanetState.previousFocus;
  musicPlanetState.previousFocus = null;
  var finish = function () {
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
  };
  if (typeof closeGsapModal === 'function') closeGsapModal(mask, finish);
  else {
    if (mask) mask.classList.remove('show');
    finish();
  }
}

function bindMusicPlanetControls() {
  if (musicPlanetState.controlsBound || typeof document === 'undefined') return;
  musicPlanetState.controlsBound = true;
  musicPlanetState.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canvas = document.getElementById('music-planet-canvas');
  var list = document.getElementById('music-planet-drawer-list');
  var fallback = document.getElementById('music-planet-fallback');
  if (canvas) {
    canvas.addEventListener('pointerdown', function (event) {
      musicPlanetState.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      var drag = musicPlanetState.drag;
      if (drag) {
        var dx = event.clientX - drag.lastX;
        var dy = event.clientY - drag.lastY;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        if (musicPlanetState.root) {
          musicPlanetState.root.rotation.y += dx * .006;
          musicPlanetState.root.rotation.x = Math.max(-.75, Math.min(.55, musicPlanetState.root.rotation.x + dy * .004));
        }
        musicPlanetShowNodeLabel(null, event);
        return;
      }
      var node = musicPlanetPointerNode(event);
      musicPlanetState.hoverNode = node;
      canvas.style.cursor = node ? 'pointer' : 'grab';
      musicPlanetShowNodeLabel(node, event);
    });
    canvas.addEventListener('pointerup', function (event) {
      var drag = musicPlanetState.drag;
      musicPlanetState.drag = null;
      if (!drag) return;
      var moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved > 7) return;
      var node = musicPlanetPointerNode(event);
      if (!node) return;
      if (node.type === 'artist') openMusicPlanetArtist(node.artist);
      else if (node.song) playMusicPlanetSong(node.song);
    });
    canvas.addEventListener('pointerleave', function (event) {
      musicPlanetState.drag = null;
      musicPlanetShowNodeLabel(null, event);
    });
    canvas.addEventListener('pointercancel', function (event) {
      musicPlanetState.drag = null;
      musicPlanetShowNodeLabel(null, event);
    });
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      musicPlanetState.zoom = Math.max(7, Math.min(15, musicPlanetState.zoom + (event.deltaY > 0 ? .65 : -.65)));
      if (musicPlanetState.camera) musicPlanetState.camera.position.z = musicPlanetState.zoom;
    }, { passive: false });
    canvas.addEventListener('keydown', function (event) {
      if (!musicPlanetState.artists.length) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        var step = event.key === 'ArrowRight' ? 1 : -1;
        musicPlanetState.keyboardIndex = (musicPlanetState.keyboardIndex + step + musicPlanetState.artists.length) % musicPlanetState.artists.length;
        openMusicPlanetArtist(musicPlanetState.keyboardIndex);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        openMusicPlanetArtist(musicPlanetState.keyboardIndex);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        musicPlanetState.zoom = Math.max(7, musicPlanetState.zoom - .65);
        if (musicPlanetState.camera) musicPlanetState.camera.position.z = musicPlanetState.zoom;
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        musicPlanetState.zoom = Math.min(15, musicPlanetState.zoom + .65);
        if (musicPlanetState.camera) musicPlanetState.camera.position.z = musicPlanetState.zoom;
      }
    });
    if (typeof ResizeObserver !== 'undefined') {
      musicPlanetState.resizeObserver = new ResizeObserver(musicPlanetResize);
      musicPlanetState.resizeObserver.observe(canvas);
    }
  }
  if (list) list.addEventListener('click', function (event) {
    var action = event.target.closest('[data-music-planet-action]');
    if (!action || !list.contains(action)) return;
    musicPlanetHandleSongAction(action.getAttribute('data-music-planet-action'), action.getAttribute('data-music-planet-song'));
  });
  if (fallback) fallback.addEventListener('click', function (event) {
    var artist = event.target.closest('[data-music-planet-artist]');
    if (!artist || !fallback.contains(artist)) return;
    openMusicPlanetArtist(Number(artist.getAttribute('data-music-planet-artist')) || 0);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) musicPlanetStopFrame();
    else musicPlanetStartFrame();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !musicPlanetState.open) return;
    var drawer = document.getElementById('music-planet-drawer');
    if (drawer && drawer.classList.contains('show')) closeMusicPlanetDrawer();
    else closeMusicPlanet();
  });
  window.addEventListener('resize', musicPlanetResize, { passive: true });
  window.addEventListener('beforeunload', function () {
    musicPlanetStopFrame();
    if (musicPlanetState.resizeObserver) musicPlanetState.resizeObserver.disconnect();
    musicPlanetDisposeScene();
    if (musicPlanetState.renderer) {
      try { musicPlanetState.renderer.dispose(); } catch (_error) { }
      musicPlanetState.renderer = null;
    }
  });
}

bindMusicPlanetControls();
