import test from 'node:test';
import assert from 'node:assert/strict';
import { weekendSlots } from './weekendCalendar';
test('all month boundaries retain Saturday left and Sunday right',()=>{
  for(let year=2026;year<=2036;year++)for(let month=3;month<=10;month++){
    const days=[];
    for(let day=1;day<=new Date(Date.UTC(year,month,0)).getUTCDate();day++){
      const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if([0,6].includes(new Date(value).getUTCDay()))days.push({id:value,value});
    }
    const slots=weekendSlots(days);assert.equal(slots.length%2,0);
    slots.forEach((d,i)=>{if(d)assert.equal(new Date(d.value).getUTCDay(),i%2===0?6:0);});
    assert.deepEqual(slots.filter(Boolean),days);
  }
});
