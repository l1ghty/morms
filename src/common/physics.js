export function resolveWormCollision(worm, terrain, endActiveTurnCallback, damageCallback) {
  // 1. Horizontal wall collision check while moving/flying fast
  if (Math.abs(worm.vx) > 0.5) {
    const checkDir = worm.vx > 0 ? 1 : -1;
    const sideX = worm.x + checkDir * (worm.halfW + 1);
    if (terrain.isSolid(sideX, worm.y - 6) || 
        terrain.isSolid(sideX, worm.y) || 
        terrain.isSolid(sideX, worm.y + 4)) {
      worm.vx = -worm.vx * 0.35;
      worm.x -= checkDir * 2;
    }
  }

  // 2. Ground collision check at feet
  const feetY = worm.y + worm.halfH;
  let isInside = false;
  for (let ox = -worm.halfW + 2; ox <= worm.halfW - 2; ox += 2) {
    if (terrain.isSolid(worm.x + ox, feetY)) {
      isInside = true;
      break;
    }
  }
  
  if (isInside) {
    if (worm.rope && worm.rope.attached) {
      worm.y -= 1.5;
      if (worm.vy > 0) worm.vy = 0;
      worm.vx *= 0.96;
      return;
    }

    if (worm.vy >= 0) {
      if (worm.isFalling && worm.vy > 7.0) {
        const rawDmg = Math.round((worm.vy - 7.0) * 6);
        const maxFallDmg = 25; // Maximum 25% of max health per fall
        const dmg = Math.min(maxFallDmg, Math.max(0, rawDmg));
        if (dmg > 0) {
          damageCallback(dmg);
          if (worm.game && worm.game.activeWorm === worm && 
              ['PLAYING', 'FIRING', 'RETREAT'].includes(worm.game.state)) {
            endActiveTurnCallback();
          }
        }
      }
      worm.vy = 0;
      worm.isFalling = false;
      worm.vx *= 0.75;
      if (Math.abs(worm.vx) < 0.05) {
        worm.vx = 0;
      }
      
      let pushUpCount = 0;
      const maxPushUp = 20;
      while (pushUpCount < maxPushUp) {
        let stillInside = false;
        for (let ox = -worm.halfW + 2; ox <= worm.halfW - 2; ox += 2) {
          if (terrain.isSolid(worm.x + ox, worm.y + worm.halfH)) {
            stillInside = true;
            break;
          }
        }
        if (stillInside) {
          worm.y -= 1.0;
          pushUpCount++;
        } else {
          break;
        }
      }
    } else {
      worm.vy = 0.5;
      worm.vx *= 0.6;
      worm.y += 1.5;
    }
  } else {
    let hasGround = false;
    for (let ox = -worm.halfW + 2; ox <= worm.halfW - 2; ox += 2) {
      if (terrain.isSolid(worm.x + ox, feetY + 2.5)) {
        hasGround = true;
        break;
      }
    }
    if (!hasGround) {
      worm.isFalling = true;
    }
  }
}

export function moveWorm(worm, terrain, dir, dt) {
  if (worm.health <= 0 || worm.isFalling) return false;
  
  if (dir !== 0) {
    worm.facingDir = dir;
    const newX = worm.x + dir * worm.walkSpeed * dt;
    const feetY = worm.y + worm.halfH;
    
    let climbHeight = -1;
    const maxSlopeClimb = Math.max(8, Math.ceil(worm.walkSpeed * dt * 1.6));
    
    for (let h = 0; h <= maxSlopeClimb; h++) {
      let isClear = true;
      const offsets = dir === 1 ? [-2, 0, 2, 4, 5] : [-5, -4, -2, 0, 2];
      for (const ox of offsets) {
        if (terrain.isSolid(newX + ox, feetY - h) ||
            terrain.isSolid(newX + ox, feetY - h - 8) ||
            terrain.isSolid(newX + ox, feetY - h - 15)) {
          isClear = false;
          break;
        }
      }
      if (isClear) {
        climbHeight = h;
        break;
      }
    }
    
    if (climbHeight !== -1) {
      worm.x = newX;
      worm.y -= climbHeight;
      
      if (climbHeight === 0) {
        const maxSlopeDescend = 8;
        let foundGroundOffset = -1;
        for (let dy = 1; dy <= maxSlopeDescend; dy++) {
          let isGroundSolid = false;
          for (let ox = -worm.halfW + 2; ox <= worm.halfW - 2; ox += 2) {
            if (terrain.isSolid(worm.x + ox, worm.y + worm.halfH + dy)) {
              isGroundSolid = true;
              break;
            }
          }
          if (isGroundSolid) {
            foundGroundOffset = dy;
            break;
          }
        }
        if (foundGroundOffset !== -1) {
          worm.y += (foundGroundOffset - 1);
        }
      }
      return true;
    } else {
      worm.vx = 0;
      return false;
    }
  }
  return false;
}

export function setupWeaponProperties(type, selectedFuseTime) {
  const props = {
    radius: 4,
    elasticity: 0.5,
    affectedByWind: false,
    contactFuse: false,
    blastRadius: 45,
    maxDamage: 50,
    knockbackForce: 7.5
  };
  
  switch (type) {
    case 'bazooka':
      props.radius = 3;
      props.affectedByWind = true;
      props.contactFuse = true;
      props.blastRadius = 45;
      props.maxDamage = 50;
      props.knockbackForce = 7.5;
      break;
    case 'grenade':
      props.radius = 4;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = selectedFuseTime || 3.0;
      props.elasticity = 0.55;
      props.blastRadius = 70;
      props.maxDamage = 55;
      props.knockbackForce = 8.0;
      break;
    case 'cluster':
      props.radius = 4;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = selectedFuseTime || 3.0;
      props.elasticity = 0.5;
      props.blastRadius = 40;
      props.maxDamage = 45;
      props.knockbackForce = 6.5;
      break;
    case 'cluster_shrapnel':
      props.radius = 3;
      props.affectedByWind = false;
      props.contactFuse = true;
      props.elasticity = 0.45;
      props.blastRadius = 25;
      props.maxDamage = 25;
      props.knockbackForce = 4.5;
      break;
    case 'holy':
      props.radius = 5;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = selectedFuseTime || 3.0;
      props.elasticity = 0.65;
      props.blastRadius = 85;
      props.maxDamage = 95;
      props.knockbackForce = 14.0;
      props.playedHallelujah = false;
      break;
    case 'dynamite':
      props.radius = 5;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = 5.0;
      props.elasticity = 0.15;
      props.blastRadius = 110;
      props.maxDamage = 85;
      props.knockbackForce = 12.0;
      break;
    case 'airstrike_missile':
      props.radius = 4;
      props.affectedByWind = false;
      props.contactFuse = true;
      props.blastRadius = 42;
      props.maxDamage = 45;
      props.knockbackForce = 7.0;
      break;
    case 'banana':
      props.radius = 6;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = selectedFuseTime || 3.0;
      props.elasticity = 0.88;
      props.blastRadius = 85;
      props.maxDamage = 75;
      props.knockbackForce = 12.0;
      break;
    case 'banana_shrapnel':
      props.radius = 4;
      props.affectedByWind = false;
      props.contactFuse = false;
      props.fuse = 1.5 + Math.random() * 2.0;
      props.elasticity = 0.84;
      props.blastRadius = 60;
      props.maxDamage = 45;
      props.knockbackForce = 9.5;
      break;
    case 'super_sheep':
      props.radius = 6;
      props.affectedByWind = false;
      props.contactFuse = true;
      props.fuse = 12.0;
      props.elasticity = 0.5;
      props.blastRadius = 90;
      props.maxDamage = 75;
      props.knockbackForce = 11.0;
      break;
    case 'baseball_bat':
      props.radius = 1;
      props.blastRadius = 0;
      props.maxDamage = 30;
      props.knockbackForce = 16.0;
      break;
  }
  return props;
}

export function getTerrainNormal(tx, ty, terrain) {
  let nx = 0;
  let ny = 0;
  const r = 4;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        if (terrain.isSolid(tx + dx, ty + dy)) {
          nx -= dx;
          ny -= dy;
        }
      }
    }
  }
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len === 0) return { x: 0, y: -1 };
  return { x: nx / len, y: ny / len };
}

export function handleTerrainBounce(proj, terrain, onBounceAudioCallback) {
  const normal = getTerrainNormal(proj.x, proj.y, terrain);
  const dot = proj.vx * normal.x + proj.vy * normal.y;
  
  if (dot < 0) {
    proj.vx = (proj.vx - 2 * dot * normal.x) * proj.elasticity;
    proj.vy = (proj.vy - 2 * dot * normal.y) * proj.elasticity;
    if (onBounceAudioCallback) {
      onBounceAudioCallback();
    }
    
    let limit = 0;
    while (terrain.isSolid(proj.x, proj.y) && limit < 15) {
      proj.x += normal.x * 0.8;
      proj.y += normal.y * 0.8;
      limit++;
    }
    if (proj.type === 'banana_shrapnel' && !proj.hasImpacted) {
      proj.hasImpacted = true;
      proj.fuse = 0.35 + Math.random() * 0.3;
    }
  }
  
  const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
  if (speed < 0.25) {
    proj.vx = 0;
    proj.vy = 0;
  }
}

export function calculateExplosionImpact(ex, ey, radius, maxDamage, knockbackForce, worms, projectiles, onWormDamage, onLaunchWorm, onLaunchProj) {
  // Worm impacts
  worms.forEach(worm => {
    if (worm.health <= 0) return;
    
    const dx = worm.x - ex;
    const dy = (worm.y - 4) - ey; // Center of worm body
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectRadius = radius + 20; // Generous impact radius
    
    if (dist < effectRadius) {
      const proximity = (effectRadius - dist) / effectRadius;
      const damage = Math.round(maxDamage * Math.pow(proximity, 1.1));
      if (damage > 0) {
        onWormDamage(worm, damage);
      }
      
      const angle = dist === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
      const forceScale = knockbackForce * 1.35 * Math.pow(proximity, 0.8);
      
      let horizontalPush = Math.cos(angle) * forceScale;
      let verticalPush = Math.sin(angle) * forceScale;
      
      // Guaranteed upward launch component so explosions near/below ground launch worms into high arcs
      const upwardLift = -Math.max(3.5, knockbackForce * 0.55) * Math.pow(proximity, 0.7);
      verticalPush = Math.min(verticalPush, 0) + upwardLift;
      
      if (Math.abs(horizontalPush) < 0.5 && dist > 0) {
        horizontalPush = (dx >= 0 ? 1 : -1) * 2.0 * proximity;
      }
      
      onLaunchWorm(worm, horizontalPush, verticalPush);
    }
  });

  // Projectile impacts
  projectiles.forEach(proj => {
    const dx = proj.x - ex;
    const dy = proj.y - ey;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectRadius = radius + 20;
    
    if (dist > 0 && dist < effectRadius) {
      const proximity = (effectRadius - dist) / effectRadius;
      const angle = Math.atan2(dy, dx);
      const push = knockbackForce * 0.7 * proximity;
      
      onLaunchProj(proj, Math.cos(angle) * push, Math.sin(angle) * push);
    }
  });
}

export function getSafeSpawnPoint(minX, maxX, terrain, waterLevel, mapType) {
  let attempts = 0;
  while (attempts < 150) {
    const x = minX + Math.random() * (maxX - minX);
    let y = 350;
    let foundGround = false;
    while (y < waterLevel - 30) {
      if (terrain.isSolid(x, y)) {
        foundGround = true;
        break;
      }
      y += 2;
    }
    if (foundGround) {
      while (y > 100 && terrain.isSolid(x, y)) {
        y--;
      }
      if (mapType === 'cave' && y < 285) {
        attempts++;
        continue;
      }
      return { x, y: y - 10 };
    }
    attempts++;
  }
  return { x: minX + (maxX - minX) / 2, y: 550 };
}

export function getActiveTeamWorm(team, worms) {
  const teamWorms = worms.filter(w => w.teamName === team.name);
  let checkedCount = 0;
  let indexToCheck = team.activeWormIndex;
  
  while (checkedCount < teamWorms.length) {
    const candidate = teamWorms[indexToCheck];
    if (candidate.health > 0) {
      team.activeWormIndex = indexToCheck;
      return candidate;
    }
    indexToCheck = (indexToCheck + 1) % teamWorms.length;
    checkedCount++;
  }
  return null;
}

export function rotateActiveWorm(teams, activeTeamIndex, worms, onGameOver) {
  const currentTeam = teams[activeTeamIndex];
  const liveWormsInTeam = worms.filter(w => w.teamName === currentTeam.name && w.health > 0);
  
  if (liveWormsInTeam.length > 0) {
    currentTeam.activeWormIndex = (currentTeam.activeWormIndex + 1) % worms.filter(w => w.teamName === currentTeam.name).length;
  }
  
  const nextTeamIndex = (activeTeamIndex + 1) % teams.length;
  const team = teams[nextTeamIndex];
  const nextWorm = getActiveTeamWorm(team, worms);
  
  if (!nextWorm) {
    const otherTeamIndex = (nextTeamIndex + 1) % teams.length;
    const otherTeam = teams[otherTeamIndex];
    onGameOver(otherTeam.name);
    return null;
  }
  
  return { nextWorm, nextTeamIndex };
}

export function getRandomWindStrength() {
  const windStrengths = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];
  return windStrengths[Math.floor(Math.random() * windStrengths.length)];
}


