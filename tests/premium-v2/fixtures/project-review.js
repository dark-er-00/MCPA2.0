// Apply a deep link through the real Projects controls when the fixture screen is ready.
(() => {
  window.MCPAProjectPhotoStore = {
    notice:'Preview uploads last until this local server restarts.',
    async save(file,project) {
      const form = new FormData();
      form.set('photo',file);
      form.set('project',JSON.stringify(project));
      const response = await fetch('/__project-photo-save',{method:'POST',headers:{Authorization:localStorage.getItem('fixture.account')},body:form});
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error || 'Photo save failed. Retry with your selection.');
      return result;
    }
  };
  const query = new URLSearchParams(location.search);
  const project = query.get('project');
  const editor = query.get('editor');
  if (!project && !editor && query.get('page') !== '2') return;
  document.addEventListener('mcpa:navigation-ready', function showExample(event) {
    if (event.detail.route.split('?')[0] !== (editor==='edit'?'site-detail':'sites')) return;
    document.removeEventListener('mcpa:navigation-ready', showExample);
    if (editor) {
      document.querySelector(editor==='edit'?'[data-action="edit-site"]':'[data-action="add-site"]')?.click();
    } else if (project) {
      const search = document.getElementById('projects-search');
      search.value = project;
      search.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      document.querySelector('.projects-pagination:not([hidden]) [data-action="next-projects"]')?.click();
    }
  });
})();
