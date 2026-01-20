import { Geolocation, PermissionStatus } from '@capacitor/geolocation';

export const ensureLocationPermission = async (): Promise<boolean> => {
    try {
        const status: PermissionStatus = await Geolocation.checkPermissions();
        if (status.location === 'granted') return true;

        const req = await Geolocation.requestPermissions();
        return req.location === 'granted';
    } catch (e) {
        console.error('Erreur permission geolocation', e);
        return false;
    }
}

export const getCurrentPosition = async (): Promise<{ lat: number; lng: number } | null> => {
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                console.error('Géolocalisation erreur', err);
                resolve(null);
            },
            { timeout: 10000 }
        );
    });
};