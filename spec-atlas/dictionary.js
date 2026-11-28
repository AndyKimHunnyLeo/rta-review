(() => {
  'use strict';
  const {sources, monsters, builds} = globalThis.specCatalog;
  const byId = id => document.getElementById(id);
  const sourceNames = new Map(sources.map(source => [source.id, source.label]));
  const monsterById = new Map(monsters.map(monster => [monster.id, monster]));
  const buildById = new Map(builds.map(build => [build.id, build]));
  const byMonster = new Map(monsters.map(monster => [monster.id, []]));
  builds.forEach(build => byMonster.get(build.monsterId).push(build));

  const elements = {'물':'물', '불':'불', '풍':'바람', '빛':'빛', '암':'어둠'};
  const labels = ['체력','공격력','방어력','공격속도','치명 확률','치명 피해','효과 저항','효과 적중'];
  const sortIndex = {hp:0, atk:1, def:2, spd:3, acc:7, name:3};
  const effects = {'폭주':'추가 턴 획득 +22%', '반격':'반격 +15%', '의지':'면역 +1턴', '집중':'효과 적중 +20%', '신속':'공격속도 +25%', '절망':'기절 확률 +25%', '응보':'잃은 체력 7%당 공격 게이지 +4%'};
  const point = (build, i) => i < 4 ? build.base[i] + build.bonus[i] : build.rates[i - 4];
  const format = (n, i) => n.toLocaleString('ko-KR') + (i > 3 ? '%' : '');
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function runeNames(build, describe = false) {
    return [...new Set(build.runes)].map(rune => {
      const count = build.runes.filter(name => name === rune).length;
      const label = count > 1 ? rune + ' ×' + count : rune;
      return describe && effects[rune] ? label + ' · ' + effects[rune] : label;
    });
  }
  // Two records can share a source, a player, and even a capture date.
  const captions = new Map();
  for (const siblings of byMonster.values()) {
    const names = siblings.map(b => [sourceNames.get(b.sourceId), b.player, b.label].filter(Boolean).join(' · '));
    const dated = names.map((name, i) => names.indexOf(name) !== names.lastIndexOf(name) && siblings[i].date
      ? name + ' · ' + siblings[i].date : name);
    siblings.forEach((build, i) => {
      let name = dated[i];
      if (dated.indexOf(name) !== dated.lastIndexOf(name))
        name += ' · 세팅 ' + (dated.slice(0, i + 1).filter(value => value === name).length);
      captions.set(build.id, name);
    });
  }
  function searchText(build) {
    const m = monsterById.get(build.monsterId);
    return normalize([m.name, m.element + m.name, elements[m.element] + m.name, m.type,
      ...m.aliases, captions.get(build.id), build.date, ...build.runes].join(' '));
  }
  const searchable = new Map(builds.map(build => [build.id, searchText(build)]));
  let element = '';
  let selected = null;
  let matches = new Map();

  function filteredList() {
    const words = byId('query').value.trim().split(/[\s,·]+/).filter(Boolean).map(normalize);
    const origin = byId('origin').value, rune = byId('runes').value;
    const metric = byId('order').value, idx = sortIndex[metric];
    matches = new Map();
    const result = [];
    for (const monster of monsters) {
      if (element && monster.element !== element) continue;
      const records = byMonster.get(monster.id).filter(build =>
        (!origin || origin === build.sourceId) && (!rune || build.runes.includes(rune)) &&
        words.every(word => searchable.get(build.id).includes(word)));
      if (!records.length) continue;
      records.sort((a,b) => metric === 'name' ? 0 : point(b,idx) - point(a,idx));
      matches.set(monster.id, records);
      const values = records.map(build => point(build,idx));
      result.push({monster, records, low:Math.min(...values), high:Math.max(...values)});
    }
    const byName = (a,b) => a.monster.name.localeCompare(b.monster.name,'ko') || a.monster.element.localeCompare(b.monster.element,'ko');
    result.sort((a,b) => metric === 'name' ? byName(a,b) : b.high - a.high || byName(a,b));
    return result;
  }
  function renderList(preferred) {
    const rows = filteredList();
    const metricIndex = sortIndex[byId('order').value];
    byId('metric-name').textContent = labels[metricIndex];
    const n = rows.reduce((sum, group) => sum + group.records.length, 0);
    byId('found').textContent = rows.length + '종 · 세팅 ' + n + '개';
    byId('empty').hidden = rows.length > 0;
    const anchors = rows.map(({monster, records, low, high}) => {
      const link = node('a', null, 'row');
      link.href = '#' + records[0].id;
      link.dataset.monster = monster.id;
      const img = node('img'); img.src = monster.portrait; img.width = 40; img.height = 40; img.alt = ''; img.loading = 'lazy';
      const name = node('span');
      name.append(node('strong',monster.name), node('small', elements[monster.element] + ' · 세팅 ' + records.length + '개'));
      const range = low === high ? format(high,metricIndex) : format(low,metricIndex) + '–' + format(high,metricIndex);
      link.append(img, name, node('span',range,'value'));
      return link;
    });
    byId('units').replaceChildren(...anchors);
    const previous = preferred || selected;
    const sameUnit = previous && matches.get(previous.monsterId);
    const next = sameUnit?.includes(previous) ? previous : sameUnit?.[0] || rows[0]?.records[0];
    show(next);
  }

  function statRow(label, values) {
    const row = node('tr'), heading = node('th', label);
    heading.scope = 'row'; row.append(heading, ...values.map(v => node('td', v)));
    return row;
  }
  function renderStats(b) {
    byId('stats').replaceChildren(...labels.slice(0,4).map((label,i) => statRow(label,
      [format(b.base[i],i), '+' + format(b.bonus[i],i), format(point(b,i),i)])));
    byId('rates').replaceChildren(...labels.slice(4).map((label,i) => {
      const item = node('div'); item.append(node('dt',label),node('dd',format(b.rates[i],i + 4))); return item;
    }));
    byId('set-list').replaceChildren(...runeNames(b,true).map(text => node('li',text)));
    byId('artifacts').replaceChildren(...b.artifacts.map(text => node('li',text)));
    byId('relic').textContent = b.relic;
    byId('skills').textContent = b.skills.join(' · ') || '표시 없음';
    byId('note').hidden = !b.note;
    byId('note').textContent = b.note || '';
    byId('evidence-label').textContent = b.evidenceLabel || '';
    byId('evidence-box').hidden = !b.evidence;
    byId('evidence-box').open = false;
    const evidence = byId('evidence');
    evidence.removeAttribute('src');
    evidence.alt = monsterById.get(b.monsterId).name + ' · ' + captions.get(b.id) + ' 스펙 화면';
  }
  function compareOptions(monster) {
    const select = byId('compare'), oldId = select.value;
    const prompt = new Option('비교할 세팅 선택','');
    const own = node('optgroup'); own.label = '같은 몬스터';
    const others = node('optgroup'); others.label = '다른 몬스터';
    for (const m of [...monsters].sort((a,b) => a.name.localeCompare(b.name,'ko'))) {
      for (const b of byMonster.get(m.id)) {
        if (b === selected) continue;
        const title = elements[m.element] + ' ' + m.name + ' · ' + captions.get(b.id);
        (m === monster ? own : others).append(new Option(title,b.id));
      }
    }
    select.replaceChildren(prompt, ...[own,others].filter(group => group.children.length));
    if (oldId !== selected.id && buildById.has(oldId)) select.value = oldId;
    renderComparison();
  }
  function renderComparison() {
    const other = buildById.get(byId('compare').value);
    const table = byId('compare-table');
    table.hidden = !other || !selected || other === selected;
    if (table.hidden) return;
    const heading = build => {
      const m = monsterById.get(build.monsterId);
      return elements[m.element] + ' ' + m.name + '\n' + captions.get(build.id);
    };
    byId('name-a').textContent = heading(selected); byId('name-b').textContent = heading(other);
    const fields = [
      ['룬 세트', b => runeNames(b).join(' · ')],
      ...labels.map((label,i) => [label, b => format(point(b,i),i)]),
      ['유물', b => b.relic], ['아티팩트', b => b.artifacts.join('\n')],
      ['스킬 강화', b => b.skills.join(' · ') || '표시 없음']
    ];
    byId('compare-lines').replaceChildren(...fields.map(([label,value]) => {
      const a = value(selected), b = value(other), row = statRow(label,[a,b]);
      row.classList.toggle('different',a !== b);
      return row;
    }));
  }
  function show(build) {
    const changedMonster = selected?.monsterId !== build?.monsterId;
    selected = build || null;
    byId('detail').hidden = !build;
    if (!build) return;
    const monster = monsterById.get(build.monsterId), siblings = byMonster.get(monster.id);
    for (const link of byId('units').children) {
      if (link.dataset.monster === monster.id) {
        link.setAttribute('aria-current','true'); link.href = '#' + build.id;
      } else link.removeAttribute('aria-current');
    }
    byId('unit-name').textContent = monster.name;
    byId('unit-meta').textContent = [elements[monster.element] + ' 속성', monster.type].join(' · ');
    byId('aliases').textContent = monster.aliases.filter(alias => normalize(alias) !== normalize(monster.element + monster.name)).join(' · ');
    byId('face').src = monster.portrait;
    const choices = matches.get(monster.id);
    const picker = byId('build-select');
    const option = b => new Option(captions.get(b.id), b.id);
    if (choices.length === siblings.length) {
      picker.replaceChildren(...siblings.map(option));
    } else {
      const matched = node('optgroup'), other = node('optgroup');
      matched.label = '검색 조건에 맞는 세팅';
      other.label = '이 몬스터의 다른 세팅';
      matched.append(...choices.map(option));
      other.append(...siblings.filter(b => !choices.includes(b)).map(option));
      picker.replaceChildren(matched, other);
    }
    byId('build-select').value = build.id;
    byId('build-count').textContent = choices.length !== siblings.length
      ? '조건에 맞는 ' + choices.length + '개 / 전체 ' + siblings.length + '개'
      : '이 몬스터의 세팅 ' + siblings.length + '개';
    byId('build-meta').textContent = [build.date, runeNames(build).join(' · ')].filter(Boolean).join('　/　');
    byId('compare-sibling').hidden = siblings.length < 2;
    if (changedMonster) { byId('compare').value = ''; byId('comparison').open = false; }
    compareOptions(monster); renderStats(build);
  }
  function scrollToDetails() {
    if (window.matchMedia('(max-width: 820px)').matches) byId('detail').scrollIntoView({block:'start'});
  }
  function choose(build, scroll = false) {
    if (location.hash !== '#' + build.id) history.pushState(null,'','#' + build.id);
    show(build);
    if (scroll) scrollToDetails();
  }
  function resetFilters() {
    element = ''; byId('query').value = ''; byId('origin').value = ''; byId('runes').value = '';
    markElement();
  }
  function markElement() {
    for (const button of byId('elements').children)
      button.setAttribute('aria-pressed',String(button.dataset.element === element));
  }
  function linkedBuild() {
    const id = location.hash.slice(1);
    return buildById.get(id) || byMonster.get(id)?.[0];
  }
  function applyFilters() {
    renderList();
    if (linkedBuild() && linkedBuild() !== selected) {
      history.replaceState(null,'',selected ? '#' + selected.id : location.pathname + location.search);
    }
  }
  byId('inventory').textContent = monsters.length + '종 · 세팅 ' + builds.length + '개 · 출처 ' + sources.length + '곳';
  for (const [id,label] of Object.entries({'':'전체',...elements})) {
    const button = node('button',label); button.type = 'button'; button.dataset.element = id;
    button.addEventListener('click',() => {element = id; markElement(); applyFilters();});
    byId('elements').append(button);
  }
  for (const s of sources) byId('origin').add(new Option(s.label,s.id));
  for (const rune of new Set(builds.flatMap(b => b.runes))) byId('runes').add(new Option(rune,rune));
  byId('query').addEventListener('input',applyFilters);
  for (const id of ['origin','runes','order']) byId(id).addEventListener('change',applyFilters);
  byId('reset').addEventListener('click',() => {resetFilters(); applyFilters(); byId('query').focus();});
  byId('units').addEventListener('click',event => {
    const link = event.target.closest('.row');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); choose(buildById.get(link.hash.slice(1)),true);
  });
  byId('build-select').addEventListener('change',event => choose(buildById.get(event.target.value)));
  byId('compare').addEventListener('change',renderComparison);
  byId('compare-sibling').addEventListener('click',() => {
    const sibling = matches.get(selected.monsterId).find(b => b !== selected)
      || byMonster.get(selected.monsterId).find(b => b !== selected);
    byId('compare').value = sibling.id;
    byId('comparison').open = true; renderComparison(); byId('compare').focus();
  });
  byId('evidence-box').addEventListener('toggle',event => {
    if (event.target.open && selected?.evidence) byId('evidence').src = selected.evidence;
  });
  window.addEventListener('hashchange',() => {
    const b = linkedBuild();
    if (!b) {
      if (!location.hash) renderList(buildById.get('u-5'));
      return;
    }
    if (!matches.get(b.monsterId)?.includes(b)) resetFilters();
    renderList(b); scrollToDetails();
  });
  markElement();
  renderList(linkedBuild() || buildById.get('u-5'));
  byId('app').hidden = false;
  if (linkedBuild()) scrollToDetails();
})();
