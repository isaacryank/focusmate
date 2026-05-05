export function formatDateForStorage(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
  
    return `${year}-${month}-${day}`;
  }
  
  export function formatTimeForStorage(date: Date) {
    let hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    const meridian = hours >= 12 ? 'PM' : 'AM';
  
    hours = hours % 12;
  
    if (hours === 0) {
      hours = 12;
    }
  
    return `${hours}:${minutes} ${meridian}`;
  }
  
  export function dateFromStorage(value?: string) {
    if (!value) return new Date();
  
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  
    if (!match) return new Date();
  
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
  
    return new Date(year, month - 1, day);
  }
  
  export function timeFromStorage(value?: string) {
    const date = new Date();
  
    if (!value) return date;
  
    const match = value
      .trim()
      .toUpperCase()
      .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  
    if (!match) return date;
  
    let hour = Number(match[1]);
    const minute = Number(match[2] || '0');
    const meridian = match[3];
  
    if (meridian === 'AM' && hour === 12) {
      hour = 0;
    }
  
    if (meridian === 'PM' && hour !== 12) {
      hour += 12;
    }
  
    date.setHours(hour);
    date.setMinutes(minute);
    date.setSeconds(0);
    date.setMilliseconds(0);
  
    return date;
  }