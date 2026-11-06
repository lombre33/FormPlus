// Consigne GFS 023 : pose [data-gfs-pending] sur <html> AVANT la première image. Un
// <script type="module"> (main.js) charge d'abord tous ses imports puis s'exécute : la page se
// dessine une première fois pendant ce temps (16 ms mesurés par GFS, contre 76 ms pour l'attribut
// posé depuis main.js) - l'éclair que la consigne GFS 017 voulait éviter restait donc entier. Un
// script CLASSIQUE, chargé ici en <head> avant les feuilles, s'exécute avant cette première image
// (comme js/theme.js chez Automation+, dont ce mécanisme est repris).
// Un script classique ne peut pas importer hostContract() du kit (un module ES) : test
// volontairement simple, pas une validation stricte - main.js (module, plus bas) retire l'attribut
// sans condition dès que l'ambiance est posée ou après son délai de repli, qu'il ait été posé ici
// ou non (retirer un attribut absent ne fait rien). Jamais hors GFS : location.search n'y contient
// jamais gfs=<n>.
if (/[?&]gfs=\d/.test(location.search)) document.documentElement.dataset.gfsPending = '';
