<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style scoped>
/* Same reason as `.wa-root` in the page: nothing may come between <body>
   and `.app`. */
div {
    display: contents;
}
</style>
