(function (root) {
  'use strict';

  const initialProjects = [
    { id: 'sellerctrl', title: 'SellerCtrl', detail: 'Поставки Ozon: расчёт, документы и наклейки', active: true, area: 'area-0' },
    { id: 'flrad', title: 'FLRAD', detail: 'Поиск свежих заказов для фрилансеров', active: true, area: 'area-1' },
  ];
  function data(state) {
    return state.daily ?? { projects: initialProjects.map(project => ({ ...project })), days: [] };
  }

  function validate(daily) {
    const text = (value, limit) => typeof value === 'string' && value.length <= limit;
    const nonempty = (value, limit) => text(value, limit) && value.trim() !== '';
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const validProject = project => project && nonempty(project.id, 80) &&
      nonempty(project.title, 80) && text(project.detail, 240) &&
      typeof project.active === 'boolean' && text(project.area, 80);
    const validTask = task => task && nonempty(task.title, 190) && nonempty(task.step, 420) &&
      nonempty(task.result, 280) && text(task.project, 80) && text(task.action, 80) &&
      Number.isInteger(task.minutes) && task.minutes >= 5 && task.minutes <= 60 &&
      typeof task.done === 'boolean';
    if (!daily || !Array.isArray(daily.projects) || daily.projects.length > 30 ||
        !daily.projects.every(validProject) ||
        new Set(daily.projects.map(project => project.id)).size !== daily.projects.length ||
        !Array.isArray(daily.days) || daily.days.length > 30 ||
        new Set(daily.days.map(day => day?.date)).size !== daily.days.length ||
        !daily.days.every(day => day && typeof day.date === 'string' && date(day.date) &&
          ['rules', 'ai'].includes(day.source) && Array.isArray(day.tasks) &&
          day.tasks.length === 5 && day.tasks.every(validTask))) {
      throw Error('Некорректные данные заданий на день.');
    }
  }

  // Retain previous day records in existing backups alongside the new cycle.
  const api = { data, validate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MandalaDaily = api;
})(typeof window === 'undefined' ? globalThis : window);
