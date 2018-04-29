import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { Observable } from 'rxjs/Observable';
import { ItunesCategory } from '@shared/models/itunes-category.models';
import { ItunesPodcast } from '@shared/models/itunes-podcast.models';
import { environment } from 'environments/environment';

import * as Parser from 'rss-parser';

import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/finally';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/publishReplay';
import 'rxjs/add/operator/publishReplay';
import 'rxjs/add/operator/delay';
import 'rxjs/add/observable/throw';


@Injectable()
export class PodcastService {
  private itunesTopPodcastObservable: Observable<ItunesPodcast[]>;

  private corsProxy: string;
  private countryCode = 'US';

  constructor(private http: HttpClient) {
    this.corsProxy = environment.corsProxy;
  }

  getLocation() {
    return new Promise((resolve, reject) => {
      this.http.get<any>('http://ip-api.com/json/?callback=')
        .catch(this.handleError)
        .finally(() => resolve(true))
        .subscribe(({ countryCode }) => {
          this.countryCode = countryCode;
          resolve(true);
        });
    });
  }

  getItunesTopPodcast(limit: number = 20): Observable<ItunesPodcast[]> {
    if (this.itunesTopPodcastObservable) return this.itunesTopPodcastObservable;

    this.itunesTopPodcastObservable = this.http
      .get<any>(`${this.corsProxy}https://rss.itunes.apple.com/api/v1/${this.countryCode}/podcasts/top-podcasts/all/${limit}/explicit.json`)
      .map((response) => {
        return response.feed.results
          .map(podcast => <ItunesPodcast>{
            ...podcast,
            author: podcast.artistName,
            cover: podcast.artworkUrl100,
            title: podcast.name,
            primaryGenreName: podcast.genres[0].name,
            lastUpdate: podcast.releaseDate
          });
      })
      .publishReplay(1)
      .refCount()
      .catch(this.handleError);

    return this.itunesTopPodcastObservable;
  }


  getItunesCategories(): Observable<ItunesCategory[]> {
    return this.http
      .get<any>(`https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres?id=26`)
      .map((response) => {
        const subGenres = response['26'].subgenres;
        return Object.keys(subGenres).map(key => <ItunesCategory>subGenres[key]);
      })
      .catch(this.handleError);
  }


  searchItunesPodcastOnKeyUp(terms: Observable<string>) {
    return terms.debounceTime(400)
      .distinctUntilChanged()
      .switchMap(term => this.searchItunesPodcast(term));
  }

  searchItunesPodcast(term: string): Observable<ItunesPodcast[]> {
    return this.http
      .get<any>(`https://itunes.apple.com/search?media=podcast&country=${this.countryCode}&term=${term}&callback=`)
      .map((response) => {
        return response.results
          .map(podcast => <ItunesPodcast>{
            ...podcast,
            id: podcast.collectionId,
            author: podcast.artistName,
            cover: podcast.artworkUrl600,
            title: podcast.collectionName,
            lastUpdate: podcast.releaseDate
          });
      })
      .catch(this.handleError);
  }

  searchPodcastByCategory(categoryId: string): Observable<ItunesPodcast[]> {
    return this.http
      // tslint:disable-next-line
      .get<any>(`https://itunes.apple.com/search?media=podcast&country=${this.countryCode}&term=podcast&genreId=${categoryId}&limit=100&callback=`)
      .map((response) => {
        return response.results
          .map(podcast => <ItunesPodcast>{
            ...podcast,
            id: podcast.collectionId,
            author: podcast.artistName,
            cover: podcast.artworkUrl600,
            title: podcast.collectionName,
            lastUpdate: podcast.releaseDate
          });
      })
      .catch(this.handleError);
  }

  getFeed(podcast: ItunesPodcast): Observable<ItunesPodcast> {
    return this.http
      .get(`${this.corsProxy}${podcast.feedUrl}?format=xml`, { responseType: 'text' })
      .map(async (response) => {
        const parsedFeed = await new Parser().parseString(response);

        const episodes = parsedFeed.items
          .map(episode => {
            try {
              return {
                ...episode,
                author: podcast.author,
                src: episode.enclosure.url,
                type: episode.enclosure.type,
                cover: episode.itunes.image || podcast.cover,
                description: episode.contentSnippet || episode.content,
                size: episode.enclosure.length,
                releaseDate: episode.pubDate,
                podcastTitle: podcast.title,
                duration: episode.itunes.duration,
                podcastId: podcast.id
              }
            } catch (e) {
              return
            }
          })
          .filter(v => v);

        return {
          ...podcast,
          description: parsedFeed.description,
          episodes
        };
      })
      .catch(this.handleError);
  }

  getPodcastById(id: string): Observable<ItunesPodcast> {
    return this.http
      .get<any>(`https://itunes.apple.com/lookup?id=${id}&callback=`)
      .map((response) => {
        const podcast = response.results[0];
        return <ItunesPodcast>{
          ...podcast,
          id: podcast.collectionId,
          author: podcast.artistName,
          cover: podcast.artworkUrl600,
          title: podcast.collectionName,
          lastUpdate: podcast.releaseDate
        };
      })
      .catch(this.handleError);
  }

  private handleError(error: Response) {
    return Observable.throw(error || 'Server error');
  }

}