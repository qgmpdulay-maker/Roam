
// Tiny mock API to simulate server data.
export type Violation = {
  id: string
  timestamp: string
  street: string
  type: 'No Parking' | 'Double Parking' | 'Corner Parking' | 'Blocking Intersection'
  vehicleType: 'Sedan' | 'SUV' | 'Truck' | 'PUJ' | 'PUV' | 'Motorcycle' | 'Tricycle'
  plate: string
  lat: number
  lng: number
  resolved: boolean
  imageUrl: string
}

const now = new Date()
function tMinusMin(m: number) {
  const d = new Date(now.getTime() - m*60000)
  return d.toISOString()
}

export const violations: Violation[] = [
  { id:'v1', timestamp: tMinusMin(10), street: 'J.P. Rizal Street', type:'No Parking', vehicleType:'SUV', plate:'NAB 1234', lat:14.6345, lng:121.0982, resolved:false, imageUrl:'https://picsum.photos/seed/roam1/640/360' },
  { id:'v2', timestamp: tMinusMin(23), street: 'Aquino Ave.', type:'Double Parking', vehicleType:'Sedan', plate:'XAB 7890', lat:14.6353, lng:121.0993, resolved:false, imageUrl:'https://picsum.photos/seed/roam2/640/360' },
  { id:'v3', timestamp: tMinusMin(58), street: 'Shoe Ave.', type:'Corner Parking', vehicleType:'Tricycle', plate:'MK 4413', lat:14.6381, lng:121.0957, resolved:true, imageUrl:'https://picsum.photos/seed/roam3/640/360' }
]

export async function listViolations() {
  await new Promise(r => setTimeout(r, 300))
  return violations
}

export async function getViolation(id: string) {
  await new Promise(r => setTimeout(r, 200))
  return violations.find(v => v.id === id) || null
}

export async function resolveViolation(id: string) {
  const v = violations.find(x => x.id === id)
  if (v) v.resolved = true
  await new Promise(r => setTimeout(r, 150))
  return v ?? null
}
